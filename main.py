import logging
import os
import re
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any, Dict

import httpx
import joblib
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from supabase_utils import create_supabase, ensure_runtime_bucket, publish_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("modelfoundry.api")

supabase = create_supabase()

# Set by docker-compose: where the cloudflared sidecar exposes its metrics server
TUNNEL_METRICS_URL = os.getenv("TUNNEL_METRICS_URL")
# Optional: a fixed public URL (named tunnel, hosted deployment) instead of the quick tunnel
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "").rstrip("/") or None
HEARTBEAT_SECONDS = 60

MODEL_CACHE_DIR = "./cached_models"
MAX_MODELS_IN_MEMORY = 20
JOB_CACHE_SECONDS = 60
PUBLIC_JOB_FIELDS = "id,dataset_name,target_column,model_type,status,metrics,features,created_at"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

os.makedirs(MODEL_CACHE_DIR, exist_ok=True)


# ----------------------------------------------------------------------
# Tunnel discovery: publish the public API URL to Supabase automatically
# ----------------------------------------------------------------------
def discover_public_url() -> str | None:
    if PUBLIC_API_URL:
        return PUBLIC_API_URL
    if not TUNNEL_METRICS_URL:
        return None
    hostname = httpx.get(f"{TUNNEL_METRICS_URL}/quicktunnel", timeout=5).json().get("hostname")
    return f"https://{hostname}" if hostname else None


def is_reachable(url: str) -> bool:
    try:
        return httpx.get(f"{url}/health", timeout=10).status_code == 200
    except httpx.HTTPError:
        return False


def announce_public_url(stop: threading.Event) -> None:
    ensure_runtime_bucket(supabase)
    published, last_publish, failed_checks = None, 0.0, 0
    while not stop.is_set():
        try:
            url = discover_public_url()
            if url and url != published:
                # A fresh quick tunnel can take a few seconds to route traffic.
                # Publish once it answers (or after ~1 min, in case this
                # container can't reach the public internet itself).
                if is_reachable(url) or failed_checks >= 12:
                    publish_status(supabase, "api", {"url": url, "online": True})
                    published, last_publish, failed_checks = url, time.time(), 0
                    log.info("Prediction API is live at %s", url)
                else:
                    failed_checks += 1
            elif url and time.time() - last_publish >= HEARTBEAT_SECONDS:
                publish_status(supabase, "api", {"url": url, "online": True})
                last_publish = time.time()
        except Exception as e:
            log.warning("Could not publish API URL yet: %s", e)
        stop.wait(5 if published is None else 15)

    try:
        publish_status(supabase, "api", {"url": published, "online": False})
    except Exception:
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = threading.Event()
    announcer = None
    if supabase and (TUNNEL_METRICS_URL or PUBLIC_API_URL):
        announcer = threading.Thread(target=announce_public_url, args=(stop,), daemon=True)
        announcer.start()
    else:
        log.info("No tunnel configured — API is only reachable locally.")
    yield
    stop.set()
    if announcer:
        announcer.join(timeout=10)


app = FastAPI(title="ModelFoundry Prediction API", lifespan=lifespan)

# Public prediction API: callable from any origin (no cookies involved)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    features: Dict[str, Any]


# ----------------------------------------------------------------------
# Model + job lookups (cached)
# ----------------------------------------------------------------------
_models: "OrderedDict[str, Any]" = OrderedDict()
_models_lock = threading.Lock()
_jobs: Dict[str, tuple] = {}


def require_supabase():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client not configured")
    return supabase


def get_ready_job(model_id: str) -> dict:
    if not UUID_RE.match(model_id):
        raise HTTPException(status_code=404, detail="Model not found")

    cached = _jobs.get(model_id)
    if cached and time.time() - cached[0] < JOB_CACHE_SECONDS:
        job = cached[1]
    else:
        res = require_supabase().table("training_jobs").select(PUBLIC_JOB_FIELDS).eq("id", model_id).limit(1).execute()
        job = res.data[0] if res.data else None
        _jobs[model_id] = (time.time(), job)

    if not job or job["status"] != "ready":
        # Model was deleted (or isn't trained yet): drop any cached copy
        with _models_lock:
            _models.pop(model_id, None)
        local_path = os.path.join(MODEL_CACHE_DIR, f"{model_id}.joblib")
        if not job and os.path.exists(local_path):
            os.remove(local_path)
        raise HTTPException(status_code=404, detail="Model not found or not ready yet")
    return job


def get_model(model_id: str):
    """
    Retrieves the model from memory, the local disk cache, or Supabase Storage.
    """
    with _models_lock:
        if model_id in _models:
            _models.move_to_end(model_id)
            return _models[model_id]

    local_model_path = os.path.join(MODEL_CACHE_DIR, f"{model_id}.joblib")
    if not os.path.exists(local_model_path):
        try:
            data = require_supabase().storage.from_("models").download(f"{model_id}.joblib")
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Model file not found: {e}")
        tmp_path = f"{local_model_path}.part"
        with open(tmp_path, "wb") as f:
            f.write(data)
        os.replace(tmp_path, local_model_path)

    pipeline = joblib.load(local_model_path)
    with _models_lock:
        _models[model_id] = pipeline
        while len(_models) > MAX_MODELS_IN_MEMORY:
            _models.popitem(last=False)
    return pipeline


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@app.get("/api/v1/models/{model_id}")
def model_info(model_id: str):
    """Public details of a trained model (used by the shareable predictor page)."""
    job = get_ready_job(model_id)
    return {k: v for k, v in job.items() if k != "status"}


@app.post("/api/v1/models/{model_id}/predict")
def predict(model_id: str, request: PredictionRequest):
    """
    Returns a prediction for a given model ID.
    """
    get_ready_job(model_id)
    pipeline = get_model(model_id)

    try:
        return pipeline.predict_one(request.features)
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {e}")
    except Exception as e:
        log.exception("Prediction failed for %s", model_id)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
