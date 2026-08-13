import os
import time
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client
from model import train_and_evaluate
import traceback

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_KEY missing in environment.")
    
# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL else None

def process_job(job):
    """
    Processes a single training job.
    """
    job_id = job['id']
    dataset_path = job['dataset_path'] # Path in Supabase Storage
    target_column = job['target_column']
    model_type = job['model_type']
    
    print(f"Processing job {job_id}...")

    local_dataset_path = f"./temp_{job_id}.csv"
    local_model_path = None
    
    try:
        # 1. Update status to processing
        supabase.table("training_jobs").update({"status": "processing"}).eq("id", job_id).execute()

        # 2. Download dataset
        print(f"Downloading dataset {dataset_path}...")
        res = supabase.storage.from_("datasets").download(dataset_path)
        with open(local_dataset_path, "wb") as f:
            f.write(res)

        # 3. Load dataset
        df = pd.read_csv(local_dataset_path)
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in dataset.")
            
        y = df[target_column]
        X = df.drop(columns=[target_column])

        # 4. Train Model
        print(f"Training model {model_type}...")
        local_model_path, metrics = train_and_evaluate(X, y, model_type, str(job_id))
        
        # 5. Upload Model to Supabase Storage
        remote_model_path = f"{job_id}.joblib"
        print(f"Uploading model to {remote_model_path}...")
        with open(local_model_path, "rb") as f:
            supabase.storage.from_("models").upload(
                remote_model_path, 
                f,
                file_options={"content-type": "application/octet-stream"}
            )

        # 6. Update Database
        print("Updating database with metrics...")
        supabase.table("training_jobs").update({
            "status": "ready",
            "metrics": metrics,
            "model_path": remote_model_path
        }).eq("id", job_id).execute()

        # 7. Delete remote dataset (Privacy constraint)
        print(f"Deleting remote dataset {dataset_path}...")
        supabase.storage.from_("datasets").remove([dataset_path])

        print(f"Job {job_id} completed successfully!")

    except Exception as e:
        print(f"Error processing job {job_id}: {e}")
        traceback.print_exc()
        try:
            supabase.table("training_jobs").update({
                "status": "failed",
                "error_message": str(e)
            }).eq("id", job_id).execute()
        except Exception as db_e:
            print(f"Failed to update job status to failed: {db_e}")

    finally:
        # 8. Cleanup local files (Privacy constraint)
        if os.path.exists(local_dataset_path):
            os.remove(local_dataset_path)
        if local_model_path and os.path.exists(local_model_path):
            os.remove(local_model_path)


def run_worker():
    print("Starting ML Worker...")
    if not supabase:
        print("Supabase client not initialized. Exiting.")
        return
        
    while True:
        try:
            # Poll for pending jobs
            # Select oldest pending job
            response = supabase.table("training_jobs").select("*").eq("status", "pending").order("created_at").limit(1).execute()
            
            jobs = response.data
            
            if jobs and len(jobs) > 0:
                process_job(jobs[0])
            else:
                # No jobs found, sleep for 10 seconds to avoid CPU spin
                time.sleep(10)
                
        except Exception as e:
            print(f"Worker encountered an error while polling: {e}")
            time.sleep(10) # Sleep on error to prevent rapid failure loop

if __name__ == "__main__":
    run_worker()
