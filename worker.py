import csv
import logging
import os
import time
import traceback
from datetime import datetime, timedelta, timezone

import pandas as pd

from model import train_and_evaluate
from supabase_utils import create_supabase, ensure_runtime_bucket, publish_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("modelfoundry.worker")

POLL_SECONDS = 3
HEARTBEAT_SECONDS = 60
CLEANUP_SECONDS = 600

# Initialize Supabase Client
supabase = create_supabase()


def heartbeat(busy_job: str | None = None):
    try:
        publish_status(supabase, "worker", {"online": True, "busy": busy_job is not None})
    except Exception as e:
        log.warning("Heartbeat failed: %s", e)


def read_dataset(path: str) -> pd.DataFrame:
    """Reads a CSV, detecting the delimiter (, ; tab |) and tolerating BOMs / non-UTF8 files."""
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            with open(path, newline="", encoding=encoding) as f:
                sample = f.read(64 * 1024)
            try:
                sep = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
            except csv.Error:
                sep = ","
            df = pd.read_csv(path, sep=sep, encoding=encoding)
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not read the file as CSV text.")


def process_job(job):
    """
    Processes a single training job.
    """
    job_id = job['id']
    dataset_path = job['dataset_path']  # Path in Supabase Storage
    target_column = job['target_column'].strip()
    model_type = job['model_type']

    # Claim the job; if it was deleted in the meantime there is nothing to do
    claimed = supabase.table("training_jobs").update({"status": "processing", "error_message": None}) \
        .eq("id", job_id).eq("status", "pending").execute()
    if not claimed.data:
        return

    log.info("Processing job %s (%s, target=%s)", job_id, model_type, target_column)
    heartbeat(busy_job=job_id)

    local_dataset_path = f"./temp_{job_id}.csv"
    local_model_path = None

    try:
        # 1. Download dataset
        res = supabase.storage.from_("datasets").download(dataset_path)
        with open(local_dataset_path, "wb") as f:
            f.write(res)

        # 2. Load dataset
        df = read_dataset(local_dataset_path)
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in dataset.")
        if df.shape[1] < 2:
            raise ValueError("The dataset needs at least one feature column besides the target.")

        y = df[target_column]
        X = df.drop(columns=[target_column])

        # 3. Train Model
        local_model_path, metrics, features_schema = train_and_evaluate(X, y, model_type, str(job_id))

        # 4. Upload Model to Supabase Storage
        remote_model_path = f"{job_id}.joblib"
        with open(local_model_path, "rb") as f:
            supabase.storage.from_("models").upload(
                remote_model_path,
                f.read(),
                file_options={"content-type": "application/octet-stream", "upsert": "true"},
            )

        # 5. Update Database
        supabase.table("training_jobs").update({
            "status": "ready",
            "metrics": metrics,
            "model_path": remote_model_path,
            "features": features_schema,
            "error_message": None,
        }).eq("id", job_id).execute()

        log.info("Job %s completed: %s", job_id, metrics)

    except Exception as e:
        log.error("Error processing job %s: %s", job_id, e)
        traceback.print_exc()
        try:
            supabase.table("training_jobs").update({
                "status": "failed",
                "error_message": str(e)[:500],
            }).eq("id", job_id).execute()
        except Exception as db_e:
            log.error("Failed to update job status to failed: %s", db_e)

    finally:
        # Privacy: the uploaded dataset is never kept, whether training worked or not
        try:
            supabase.storage.from_("datasets").remove([dataset_path])
        except Exception as e:
            log.warning("Could not delete dataset %s: %s", dataset_path, e)
        if os.path.exists(local_dataset_path):
            os.remove(local_dataset_path)
        if local_model_path and os.path.exists(local_model_path):
            os.remove(local_model_path)
        heartbeat()


def reset_interrupted_jobs():
    """Jobs left 'processing' by a previous run (crash / docker stop) go back in the queue."""
    res = supabase.table("training_jobs").update({"status": "pending"}).eq("status", "processing").execute()
    if res.data:
        log.info("Re-queued %d interrupted job(s)", len(res.data))


def cleanup_orphans():
    """
    Removes model files whose job was deleted from the dashboard, and datasets
    that no queued job refers to (e.g. a job deleted before it was trained).
    """
    jobs = supabase.table("training_jobs").select("id,dataset_path,status").execute().data
    job_ids = {j["id"] for j in jobs}
    queued = {j["dataset_path"] for j in jobs if j["status"] in ("pending", "processing")}

    models = supabase.storage.from_("models").list("", {"limit": 1000})
    orphan_models = [
        f["name"] for f in models
        if f.get("id") and f["name"].endswith(".joblib") and f["name"][: -len(".joblib")] not in job_ids
    ]
    if orphan_models:
        supabase.storage.from_("models").remove(orphan_models)
        log.info("Removed %d orphaned model file(s)", len(orphan_models))

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    orphan_datasets = []
    for folder in supabase.storage.from_("datasets").list("", {"limit": 1000}):
        if folder.get("id"):  # a file at the bucket root, not a user folder
            continue
        for f in supabase.storage.from_("datasets").list(folder["name"], {"limit": 1000}):
            path = f"{folder['name']}/{f['name']}"
            created = f.get("created_at")
            old_enough = created and datetime.fromisoformat(created.replace("Z", "+00:00")) < cutoff
            if f.get("id") and path not in queued and old_enough:
                orphan_datasets.append(path)
    if orphan_datasets:
        supabase.storage.from_("datasets").remove(orphan_datasets)
        log.info("Removed %d orphaned dataset(s)", len(orphan_datasets))


def run_worker():
    log.info("Starting ML Worker...")
    if not supabase:
        log.error("Supabase client not initialized. Exiting.")
        return

    ensure_runtime_bucket(supabase)
    try:
        reset_interrupted_jobs()
    except Exception as e:
        log.warning("Could not re-queue interrupted jobs: %s", e)

    last_heartbeat = last_cleanup = 0.0
    while True:
        try:
            if time.time() - last_heartbeat >= HEARTBEAT_SECONDS:
                heartbeat()
                last_heartbeat = time.time()

            if time.time() - last_cleanup >= CLEANUP_SECONDS:
                last_cleanup = time.time()
                try:
                    cleanup_orphans()
                except Exception as e:
                    log.warning("Cleanup failed: %s", e)

            # Poll for the oldest pending job
            response = supabase.table("training_jobs").select("*").eq("status", "pending") \
                .order("created_at").limit(1).execute()

            if response.data:
                process_job(response.data[0])
                last_heartbeat = time.time()
            else:
                time.sleep(POLL_SECONDS)

        except Exception as e:
            log.warning("Worker encountered an error while polling: %s", e)
            time.sleep(10)  # Sleep on error to prevent rapid failure loop


if __name__ == "__main__":
    run_worker()
