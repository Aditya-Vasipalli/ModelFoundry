import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client
import uvicorn

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

app = FastAPI(title="ML Prediction API")

# Allow Vercel frontend to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_CACHE_DIR = "./cached_models"
if not os.path.exists(MODEL_CACHE_DIR):
    os.makedirs(MODEL_CACHE_DIR)


class PredictionRequest(BaseModel):
    features: Dict[str, Any]

def get_model(model_id: str):
    """
    Retrieves the model from local cache, or downloads it from Supabase Storage.
    """
    local_model_path = os.path.join(MODEL_CACHE_DIR, f"{model_id}.joblib")
    
    if os.path.exists(local_model_path):
        return joblib.load(local_model_path)
        
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client not configured")
        
    try:
        remote_model_path = f"{model_id}.joblib"
        res = supabase.storage.from_("models").download(remote_model_path)
        
        with open(local_model_path, "wb") as f:
            f.write(res)
            
        return joblib.load(local_model_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found or error downloading: {e}")


@app.post("/api/v1/models/{model_id}/predict")
def predict(model_id: str, request: PredictionRequest):
    """
    Returns a prediction for a given model ID.
    """
    try:
        # Load model (pipeline)
        pipeline = get_model(model_id)
        
        # Convert request features to DataFrame (pipeline expects 2D array/df)
        df_features = pd.DataFrame([request.features])
        
        # Predict
        prediction = pipeline.predict(df_features)
        
        # Check if the model has predict_proba (classification)
        result = {
            "prediction": prediction.tolist()[0]
        }
        
        if hasattr(pipeline.named_steps['model'], 'predict_proba'):
            probabilities = pipeline.predict_proba(df_features)
            # Find the max probability for the predicted class
            max_prob = probabilities.max(axis=1)[0]
            result["probability"] = float(max_prob)
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
