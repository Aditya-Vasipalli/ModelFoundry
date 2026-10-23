import logging
import os
import signal
import time
from datetime import datetime, timedelta, timezone

from supabase_utils import create_supabase, ensure_runtime_bucket, publish_status
from training import run_training

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("modelfoundry.worker")

POLL_SECONDS = 3
HEARTBEAT_SECONDS = 60
CLEANUP_SECONDS = 600
MAX_ATTEMPTS = 3
TRAINING_TIMEOUT = int(os.getenv("TRAINING_TIMEOUT_SECONDS", "900"))
USAGE_RETENTION_DAYS = 90
HEALTH_FILE = os.getenv("WORKER_HEALTH_FILE", "/tmp/worker-heartbeat")

# Initialize Supabase Client
supabase = create_supabase()
stopping = False


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def touch_health_file():
    """Docker's healthcheck reads this file's age to tell whether the loop is alive."""
    try:
        with open(HEALTH_FILE, "w") as f:
            f.write(now_iso())
    except OSError:
        pass


def heartbeat(busy_job: str | None = None):
    try:
        publish_status(supabase, "worker", {"online": True, "busy": busy_job is not None})
    except Exception as e:
        log.warning("Heartbeat failed: %s", e)


def update_job(job_id, fields):
    return supabase.table("training_jobs").update(fields).eq("id", job_id).execute()


def process_job(job):
    """
    Processes a single training job.
    """
    job_id = job['id']
    dataset_path = job['dataset_path']  # Path in Supabase Storage
    attempt = (job.get('attempts') or 0) + 1

    # Claim the job; if it was deleted or cancelled in the meantime there is nothing to do
    claimed = supabase.table("training_jobs").update({
        "status": "processing",
        "error_message": None,
        "attempts": attempt,
        "started_at": now_iso(),
        "progress": {"stage": "queued", "message": "Downloading the dataset", "percent": 2},
    }).eq("id", job_id).eq("status", "pending").execute()
    if not claimed.data:
        return

    log.info("Processing job %s (%s, target=%s, attempt %d)", job_id, job['model_type'], job['target_column'], attempt)
    heartbeat(busy_job=job_id)

    local_dataset_path = f"./temp_{job_id}.csv"
    local_model_path = None
    retrying = False
    last_progress = [0.0]
    last_heartbeat = [time.time()]

    def on_progress(p):
        # Throttle database writes; always send the final stages
        if time.time() - last_progress[0] > 1.5 or p["percent"] >= 90:
            last_progress[0] = time.time()
            try:
                update_job(job_id, {"progress": p})
            except Exception as e:
                log.debug("Progress update failed: %s", e)

    def on_tick():
        touch_health_file()
        if time.time() - last_heartbeat[0] > HEARTBEAT_SECONDS:
            last_heartbeat[0] = time.time()
            heartbeat(busy_job=job_id)

    def should_cancel():
        try:
            res = supabase.table("training_jobs").select("status").eq("id", job_id).limit(1).execute()
            return not res.data or res.data[0]["status"] == "cancelled"
        except Exception:
            return False

    try:
        # 1. Download dataset
        try:
            data = supabase.storage.from_("datasets").download(dataset_path)
        except Exception as e:
            if "not found" in str(e).lower() or "404" in str(e):
                raise ValueError("The uploaded dataset is missing. Please upload it again.")
            raise
        with open(local_dataset_path, "wb") as f:
            f.write(data)

        # 2. Train in an isolated process
        outcome = run_training(
            local_dataset_path, job['target_column'].strip(), job['model_type'], str(job_id),
            options=job.get('options') or {}, timeout=TRAINING_TIMEOUT,
            on_progress=on_progress, should_cancel=should_cancel, on_tick=on_tick,
        )

        if outcome.kind == "done":
            local_model_path, metrics, features_schema, report = outcome.result

            # 3. Upload Model to Supabase Storage
            remote_model_path = f"{job_id}.joblib"
            with open(local_model_path, "rb") as f:
                supabase.storage.from_("models").upload(
                    remote_model_path,
                    f.read(),
                    file_options={"content-type": "application/octet-stream", "upsert": "true"},
                )

            # 4. Update Database
            update_job(job_id, {
                "status": "ready",
                "metrics": metrics,
                "report": report,
                "model_path": remote_model_path,
                "features": features_schema,
                "error_message": None,
                "progress": {"stage": "done", "message": "Ready", "percent": 100},
                "finished_at": now_iso(),
            })
            log.info("Job %s completed: %s", job_id, metrics)

        elif outcome.kind == "cancelled":
            update_job(job_id, {"finished_at": now_iso(), "progress": None})
            log.info("Job %s cancelled", job_id)

        elif outcome.kind == "error" and attempt < MAX_ATTEMPTS:
            retrying = True
            update_job(job_id, {
                "status": "pending",
                "progress": None,
                "error_message": f"Retrying after an error (attempt {attempt} of {MAX_ATTEMPTS}): {outcome.message}"[:500],
            })
            log.warning("Job %s failed, will retry: %s", job_id, outcome.message)

        else:  # user_error, timeout, or out of retries
            update_job(job_id, {
                "status": "failed",
                "error_message": outcome.message[:500],
                "progress": None,
                "finished_at": now_iso(),
            })
            log.warning("Job %s failed: %s", job_id, outcome.message)

    except Exception as e:
        user_error = isinstance(e, ValueError)
        retrying = not user_error and attempt < MAX_ATTEMPTS
        log.error("Error processing job %s: %s", job_id, e)
        try:
            update_job(job_id, {
                "status": "pending" if retrying else "failed",
                "error_message": str(e)[:500],
                "progress": None,
                "finished_at": None if retrying else now_iso(),
            })
        except Exception as db_e:
            log.error("Failed to update job status: %s", db_e)

    finally:
        # Privacy: the uploaded dataset is deleted once the job is finished, whatever the outcome
        if not retrying:
            try:
                supabase.storage.from_("datasets").remove([dataset_path])
            except Exception as e:
                log.warning("Could not delete dataset %s: %s", dataset_path, e)
        for path in (local_dataset_path, local_model_path):
            if path and os.path.exists(path):
                os.remove(path)
        heartbeat()


def reset_interrupted_jobs():
    """Jobs left 'processing' by a previous run (crash / docker stop) go back in the queue."""
    res = supabase.table("training_jobs").update({"status": "pending", "progress": None}) \
        .eq("status", "processing").execute()
    if res.data:
        log.info("Re-queued %d interrupted job(s)", len(res.data))


def cleanup_orphans():
    """
    Removes model files whose job was deleted from the dashboard, datasets that no
    queued job refers to, and usage records past the retention period.
    """
    jobs = supabase.table("training_jobs").select("id,dataset_path,status").limit(10000).execute().data
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

    retention_cutoff = (datetime.now(timezone.utc) - timedelta(days=USAGE_RETENTION_DAYS)).isoformat()
    supabase.table("prediction_events").delete().lt("created_at", retention_cutoff).execute()


def handle_stop(signum, frame):
    global stopping
    stopping = True
    log.info("Stop requested; finishing up")


def run_worker():
    log.info("Starting ML Worker...")
    if not supabase:
        log.error("Supabase client not initialized. Exiting.")
        return

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)
    ensure_runtime_bucket(supabase)
    try:
        reset_interrupted_jobs()
    except Exception as e:
        log.warning("Could not re-queue interrupted jobs: %s", e)

    last_heartbeat = last_cleanup = 0.0
    while not stopping:
        touch_health_file()
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

            # Fresh jobs first, then retries (oldest first within each)
            response = supabase.table("training_jobs").select("*").eq("status", "pending") \
                .order("attempts").order("created_at").limit(1).execute()

            if response.data:
                process_job(response.data[0])
                last_heartbeat = time.time()
            else:
                time.sleep(POLL_SECONDS)

        except Exception as e:
            log.warning("Worker encountered an error while polling: %s", e)
            time.sleep(10)  # Sleep on error to prevent rapid failure loop

    try:
        publish_status(supabase, "worker", {"online": False, "busy": False})
    except Exception:
        pass
    log.info("Worker stopped")


if __name__ == "__main__":
    run_worker()
