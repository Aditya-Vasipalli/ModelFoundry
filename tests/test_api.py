"""HTTP API: auth, private models, rate limits, request validation."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
from security import Authenticator, Identity, RateLimiter, hash_api_key

MODEL_ID = '00000000-0000-4000-8000-000000000001'


class FakePipeline:
    def predict_one(self, features):
        return {'prediction': len(features)}

    def predict_many(self, rows):
        return [{'prediction': len(r)} for r in rows]


@pytest.fixture
def client(monkeypatch):
    jobs = {MODEL_ID: {'id': MODEL_ID, 'user_id': 'owner', 'status': 'ready', 'is_public': True}}

    def fake_get_ready_job(model_id, identity):
        job = jobs.get(model_id)
        if not job:
            raise HTTPException(404, 'Model not found')
        if not job['is_public']:
            if identity is None:
                raise HTTPException(401, 'private')
            if identity.user_id != job['user_id']:
                raise HTTPException(404, 'Model not found')
        return job

    monkeypatch.setattr(main, 'get_ready_job', fake_get_ready_job)
    monkeypatch.setattr(main, 'get_model', lambda model_id: FakePipeline())
    monkeypatch.setattr(main, 'rate_limiter', RateLimiter())
    monkeypatch.setattr(main.authenticator, 'identify',
                        lambda req: Identity('owner', 'k1') if req.headers.get('x-api-key') == 'mf_good' else None)
    with TestClient(main.app) as c:
        c.jobs = jobs
        yield c


def test_predict_and_batch(client):
    r = client.post(f'/api/v1/models/{MODEL_ID}/predict', json={'features': {'a': 1, 'b': 2}})
    assert r.status_code == 200 and r.json() == {'prediction': 2}
    r = client.post(f'/api/v1/models/{MODEL_ID}/predict/batch', json={'rows': [{'a': 1}, {}]})
    assert r.json() == {'predictions': [{'prediction': 1}, {'prediction': 0}]}


def test_private_models_need_the_owners_key(client):
    client.jobs[MODEL_ID]['is_public'] = False
    url = f'/api/v1/models/{MODEL_ID}/predict'
    assert client.post(url, json={'features': {}}).status_code == 401
    assert client.post(url, json={'features': {}}, headers={'X-API-Key': 'mf_good'}).status_code == 200


def test_request_validation(client):
    url = f'/api/v1/models/{MODEL_ID}/predict/batch'
    assert client.post(url, json={'rows': []}).status_code == 422
    assert client.post(url, json={'rows': [{}] * 1001}).status_code == 422
    big = 'x' * (3 * 1024 * 1024)
    r = client.post(f'/api/v1/models/{MODEL_ID}/predict', content=big, headers={'Content-Type': 'application/json'})
    assert r.status_code == 413


def test_rate_limit_returns_429_with_retry_after(client):
    url = f'/api/v1/models/{MODEL_ID}/predict'
    codes = [client.post(url, json={'features': {}}).status_code for _ in range(70)]
    assert codes.count(200) == 60 and codes[-1] == 429


def test_rate_limiter_refills_over_time(monkeypatch):
    limiter = RateLimiter()
    clock = [1000.0]
    monkeypatch.setattr('security.time.monotonic', lambda: clock[0])
    for _ in range(10):
        limiter.check('k', per_minute=10)
    with pytest.raises(HTTPException) as e:
        limiter.check('k', per_minute=10)
    assert e.value.status_code == 429 and e.value.headers['Retry-After']
    clock[0] += 6  # one token back
    limiter.check('k', per_minute=10)


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return SimpleNamespace(data=self.rows)


def make_request(headers):
    return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()})


def test_authenticator_resolves_api_keys_and_rejects_bad_ones():
    good = 'mf_secret'
    store = {hash_api_key(good): [{'id': 'key1', 'user_id': 'u1'}]}

    class FakeTable:
        def __init__(self):
            self.hash = None

        def select(self, *a):
            return self

        def eq(self, column, value):
            self.hash = value
            return self

        def limit(self, n):
            return FakeQuery(store.get(self.hash, []))

        def update(self, *a):
            return FakeQuery([])

    supabase = SimpleNamespace(table=lambda name: FakeTable())
    auth = Authenticator(supabase)
    assert auth.identify(make_request({})) is None
    assert auth.identify(make_request({'X-API-Key': good})) == Identity('u1', 'key1')
    assert auth.identify(make_request({'Authorization': f'Bearer {good}'})) == Identity('u1', 'key1')
    with pytest.raises(HTTPException) as e:
        auth.identify(make_request({'X-API-Key': 'mf_wrong'}))
    assert e.value.status_code == 401


def test_get_model_survives_an_unwritable_cache(monkeypatch, tmp_path):
    import io
    import joblib
    buf = io.BytesIO()
    joblib.dump({'a': 1}, buf)
    storage = SimpleNamespace(download=lambda path: buf.getvalue())
    fake = SimpleNamespace(storage=SimpleNamespace(from_=lambda bucket: storage))
    monkeypatch.setattr(main, 'require_supabase', lambda: fake)
    monkeypatch.setattr(main, 'MODEL_CACHE_DIR', str(tmp_path / 'missing'))
    main._models.pop(MODEL_ID, None)
    assert main.get_model(MODEL_ID) == {'a': 1}

    # A corrupt cached file is replaced by a fresh download
    main._models.pop(MODEL_ID, None)
    monkeypatch.setattr(main, 'MODEL_CACHE_DIR', str(tmp_path))
    (tmp_path / f'{MODEL_ID}.joblib').write_bytes(b'not a model')
    assert main.get_model(MODEL_ID) == {'a': 1}
    assert joblib.load(tmp_path / f'{MODEL_ID}.joblib') == {'a': 1}
    main._models.pop(MODEL_ID, None)
