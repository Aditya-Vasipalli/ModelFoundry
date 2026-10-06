"""
supabase_utils.py — Supabase client + runtime status publishing.

The backend runs on your own machine behind a Cloudflare quick tunnel whose URL
changes on every restart. Instead of copying that URL into the frontend by hand,
the backend publishes it (plus a heartbeat) as small JSON files in a public
Supabase Storage bucket. The frontend reads them to find the API and to show
whether the backend is online.
"""

import json
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

log = logging.getLogger("modelfoundry")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one log line per Supabase request is noise

RUNTIME_BUCKET = "runtime"


def create_supabase() -> Client | None:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        log.warning("SUPABASE_URL or SUPABASE_KEY missing — copy .env.example to .env and fill it in.")
        return None
    return create_client(url, key)


def ensure_runtime_bucket(supabase: Client) -> None:
    """Create the public `runtime` bucket on first run (needs the service role key)."""
    try:
        supabase.storage.get_bucket(RUNTIME_BUCKET)
        return
    except Exception:
        pass
    try:
        supabase.storage.create_bucket(RUNTIME_BUCKET, options={"public": True})
        log.info("Created public storage bucket '%s'", RUNTIME_BUCKET)
    except Exception as e:
        # Another process may have created it in the meantime.
        log.debug("create_bucket(%s) failed: %s", RUNTIME_BUCKET, e)


def publish_status(supabase: Client, name: str, payload: dict) -> None:
    body = json.dumps({**payload, "updated_at": datetime.now(timezone.utc).isoformat()}).encode()
    supabase.storage.from_(RUNTIME_BUCKET).upload(
        f"{name}.json",
        body,
        file_options={"content-type": "application/json", "cache-control": "0", "upsert": "true"},
    )
