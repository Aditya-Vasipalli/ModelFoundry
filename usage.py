"""
usage.py — records prediction usage without slowing requests down.

Events are buffered in memory and written to Supabase in batches by a
background thread; if Supabase is unreachable they're dropped, never retried
forever or allowed to grow without bound.
"""

import logging
import threading
import time
from collections import deque

log = logging.getLogger("modelfoundry.usage")

FLUSH_SECONDS = 5
MAX_BUFFER = 10000
SOURCES = {"web", "share", "api", "batch"}


class UsageRecorder:
    def __init__(self, supabase):
        self.supabase = supabase
        self._events: deque = deque(maxlen=MAX_BUFFER)
        self._stop = threading.Event()
        self._thread = None

    def record(self, model_id: str, source: str, rows: int, latency_ms: int, ok: bool):
        self._events.append({
            "model_id": model_id,
            "source": source if source in SOURCES else "api",
            "rows": rows,
            "latency_ms": latency_ms,
            "ok": ok,
        })

    def start(self):
        if self.supabase and not self._thread:
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self.flush()

    def _run(self):
        while not self._stop.wait(FLUSH_SECONDS):
            self.flush()

    def flush(self):
        batch = []
        while self._events and len(batch) < 500:
            batch.append(self._events.popleft())
        if not batch or not self.supabase:
            return
        try:
            self.supabase.table("prediction_events").insert(batch).execute()
        except Exception as e:
            log.warning("Dropped %d usage event(s): %s", len(batch), e)
