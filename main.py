import io
import logging
import os
import re
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import httpx
import joblib
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from security import Authenticator, Identity, RateLimiter
from supabase_utils import create_supabase, ensure_runtime_bucket, publish_status
from usage import UsageRecorder

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("modelfoundry.api")

supabase = create_supabase()
authenticator = Authenticator(supabase)
rate_limiter = RateLimiter()
usage = UsageRecorder(supabase)

# Set by docker-compose: where the cloudflared sidecar exposes its metrics server
TUNNEL_METRICS_URL = os.getenv("TUNNEL_METRICS_URL")
# Optional: a fixed public URL (named tunnel, hosted deployment) instead of the quick tunnel
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "").rstrip("/") or None
HEARTBEAT_SECONDS = 60

MODEL_CACHE_DIR = "./cached_models"
MAX_MODELS_IN_MEMORY = 20
JOB_CACHE_SECONDS = 10  # how quickly visibility changes and deletions reach the API
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_FEATURES = 500
MAX_BATCH_ROWS = 1000
MAX_CONCURRENT_PREDICTIONS = 8
JOB_FIELDS = "id,user_id,dataset_name,target_column,model_type,status,is_public,metrics,features,report,created_at"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
prediction_slots = threading.BoundedSemaphore(MAX_CONCURRENT_PREDICTIONS)


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
    usage.start()
    yield
    stop.set()
    usage.stop()
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


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large (max 2 MB)"}, status_code=413)
    return await call_next(request)


class PredictionRequest(BaseModel):
    features: Dict[str, Any] = Field(max_length=MAX_FEATURES)


class BatchPredictionRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(min_length=1, max_length=MAX_BATCH_ROWS)


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


def get_ready_job(model_id: str, identity: Optional[Identity]) -> dict:
    if not UUID_RE.match(model_id):
        raise HTTPException(status_code=404, detail="Model not found")

    cached = _jobs.get(model_id)
    if cached and time.time() - cached[0] < JOB_CACHE_SECONDS:
        job = cached[1]
    else:
        res = require_supabase().table("training_jobs").select(JOB_FIELDS).eq("id", model_id).limit(1).execute()
        job = res.data[0] if res.data else None
        _jobs[model_id] = (time.time(), job)

    if not job or job["status"] != "ready":
        # Model was deleted (or isn't trained yet): drop any cached copy
        with _models_lock:
            _models.pop(model_id, None)
        local_path = os.path.join(MODEL_CACHE_DIR, f"{model_id}.joblib")
        if not job and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except OSError as e:
                log.warning("Could not remove cached model %s: %s", local_path, e)
        raise HTTPException(status_code=404, detail="Model not found or not ready yet")

    if not job.get("is_public", True):
        if identity is None:
            raise HTTPException(status_code=401, detail="This model is private. Send an API key in the X-API-Key header.")
        if identity.user_id != job["user_id"]:
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
    pipeline = None
    if os.path.exists(local_model_path):
        try:
            pipeline = joblib.load(local_model_path)
        except Exception as e:
            log.warning("Cached model %s is unreadable (%s); downloading it again", local_model_path, e)
    if pipeline is None:
        try:
            data = require_supabase().storage.from_("models").download(f"{model_id}.joblib")
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Model file not found: {e}")
        try:
            tmp_path = f"{local_model_path}.part"
            with open(tmp_path, "wb") as f:
                f.write(data)
            os.replace(tmp_path, local_model_path)
        except OSError as e:
            # A read-only or wrongly owned cache only costs a re-download later
            log.warning("Model cache %s is not writable (%s); serving from memory", MODEL_CACHE_DIR, e)
        pipeline = joblib.load(io.BytesIO(data))
    with _models_lock:
        _models[model_id] = pipeline
        while len(_models) > MAX_MODELS_IN_MEMORY:
            _models.popitem(last=False)
    return pipeline


def run_prediction(request: Request, model_id: str, rows: int, source: str, predict):
    """Shared path for single and batch predictions: auth, limits, timing, usage."""
    identity = authenticator.identify(request)
    rate_limiter.limit(request, identity, cost=max(1.0, rows / 50))  # batches cost 1 per 50 rows
    get_ready_job(model_id, identity)
    pipeline = get_model(model_id)

    if not prediction_slots.acquire(timeout=10):
        raise HTTPException(status_code=503, detail="The prediction server is busy. Try again shortly.")
    started = time.perf_counter()
    ok = False
    try:
        result = predict(pipeline)
        ok = True
        return result
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {e}")
    except Exception as e:
        log.exception("Prediction failed for %s", model_id)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        prediction_slots.release()
        usage.record(model_id, source, rows, int((time.perf_counter() - started) * 1000), ok)


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@app.get("/api/v1/models/{model_id}")
def model_info(model_id: str, request: Request):
    """Public details of a trained model (used by the shareable predictor page)."""
    identity = authenticator.identify(request)
    rate_limiter.limit(request, identity)
    job = get_ready_job(model_id, identity)
    return {k: v for k, v in job.items() if k not in ("status", "user_id")}


@app.post("/api/v1/models/{model_id}/predict")
def predict(model_id: str, body: PredictionRequest, request: Request):
    """
    Returns a prediction for a given model ID.
    """
    source = request.headers.get("x-modelfoundry-source", "api")
    return run_prediction(request, model_id, 1, source, lambda p: p.predict_one(body.features))


@app.post("/api/v1/models/{model_id}/predict/batch")
def predict_batch(model_id: str, body: BatchPredictionRequest, request: Request):
    """Predicts up to 1,000 rows at once. Returns one result per row, in order."""
    return run_prediction(request, model_id, len(body.rows), "batch",
                          lambda p: {"predictions": p.predict_many(body.rows)})


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/ready")
def readiness():
    """Ready when Supabase is configured and reachable."""
    try:
        require_supabase().table("training_jobs").select("id").limit(1).execute()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Supabase unreachable: {e}")
    return {"status": "ready"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
