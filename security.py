"""
security.py — who is calling, and how often they may call.

Identity: an API key (`X-API-Key: mf_...` or `Authorization: Bearer mf_...`), a
Supabase session token forwarded by the web app (`Authorization: Bearer <jwt>`),
or nobody. Private models require the owner's identity.

Rate limiting: a token bucket per caller (API key, user, or client IP).
"""

import hashlib
import threading
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request

API_KEY_PREFIX = "mf_"
CACHE_SECONDS = 60
LAST_USED_WRITE_SECONDS = 300

ANONYMOUS_PER_MINUTE = 60
AUTHENTICATED_PER_MINUTE = 600


@dataclass(frozen=True)
class Identity:
    user_id: str
    key_id: Optional[str] = None  # set when authenticated with an API key


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class Authenticator:
    def __init__(self, supabase):
        self.supabase = supabase
        self._cache: dict = {}
        self._last_used_written: dict = {}
        self._lock = threading.Lock()

    def _cached(self, cache_key):
        entry = self._cache.get(cache_key)
        if entry and time.time() - entry[0] < CACHE_SECONDS:
            return entry[1], True
        return None, False

    def _store(self, cache_key, value):
        with self._lock:
            if len(self._cache) > 5000:
                self._cache.clear()
            self._cache[cache_key] = (time.time(), value)

    def identify(self, request: Request) -> Optional[Identity]:
        """Returns the caller's identity, None for anonymous callers. Raises 401 on bad credentials."""
        api_key = request.headers.get("x-api-key")
        auth = request.headers.get("authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else None
        if not api_key and token and token.startswith(API_KEY_PREFIX):
            api_key, token = token, None

        if api_key:
            identity = self._from_api_key(api_key)
            if not identity:
                raise HTTPException(status_code=401, detail="Invalid API key")
            return identity
        if token:
            identity = self._from_session(token)
            if not identity:
                raise HTTPException(status_code=401, detail="Session expired — sign in again")
            return identity
        return None

    def _from_api_key(self, key: str) -> Optional[Identity]:
        digest = hash_api_key(key)
        cached, hit = self._cached(("key", digest))
        if hit:
            identity = cached
        else:
            res = self.supabase.table("api_keys").select("id,user_id").eq("key_hash", digest).limit(1).execute()
            identity = Identity(res.data[0]["user_id"], res.data[0]["id"]) if res.data else None
            self._store(("key", digest), identity)
        if identity:
            self._touch_key(identity.key_id)
        return identity

    def _from_session(self, token: str) -> Optional[Identity]:
        digest = hashlib.sha256(token.encode()).hexdigest()
        cached, hit = self._cached(("jwt", digest))
        if hit:
            return cached
        try:
            user = self.supabase.auth.get_user(token).user
            identity = Identity(user.id) if user else None
        except Exception:
            identity = None
        self._store(("jwt", digest), identity)
        return identity

    def _touch_key(self, key_id: str):
        """Records when a key was last used, at most every few minutes per key."""
        now = time.time()
        if now - self._last_used_written.get(key_id, 0) < LAST_USED_WRITE_SECONDS:
            return
        self._last_used_written[key_id] = now

        def write():
            try:
                self.supabase.table("api_keys").update(
                    {"last_used_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
                ).eq("id", key_id).execute()
            except Exception:
                pass

        threading.Thread(target=write, daemon=True).start()


def client_ip(request: Request) -> str:
    # The web app forwards the visitor's IP; Cloudflare adds the caller's IP for direct calls
    for header in ("x-client-ip", "cf-connecting-ip", "x-forwarded-for"):
        value = request.headers.get(header)
        if value:
            return value.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """Token bucket per caller: `rate` requests per minute with bursts up to `rate`."""

    def __init__(self):
        self._buckets: dict = {}
        self._lock = threading.Lock()

    def check(self, key: str, per_minute: int, cost: float = 1.0) -> None:
        now = time.monotonic()
        with self._lock:
            tokens, updated = self._buckets.get(key, (float(per_minute), now))
            tokens = min(float(per_minute), tokens + (now - updated) * per_minute / 60.0)
            if tokens < cost:
                retry_after = max(1, int((cost - tokens) * 60 / per_minute) + 1)
                self._buckets[key] = (tokens, now)
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded ({per_minute} requests/minute). Retry in {retry_after}s.",
                    headers={"Retry-After": str(retry_after)},
                )
            self._buckets[key] = (tokens - cost, now)
            if len(self._buckets) > 20000:  # forget idle callers
                cutoff = now - 120
                self._buckets = {k: v for k, v in self._buckets.items() if v[1] > cutoff}

    def limit(self, request: Request, identity: Optional[Identity], cost: float = 1.0) -> None:
        if identity:
            key = f"key:{identity.key_id}" if identity.key_id else f"user:{identity.user_id}"
            self.check(key, AUTHENTICATED_PER_MINUTE, cost)
        else:
            self.check(f"ip:{client_ip(request)}", ANONYMOUS_PER_MINUTE, cost)
