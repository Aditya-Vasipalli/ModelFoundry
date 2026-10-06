# ModelFoundry

Upload a CSV, pick the column to predict, and get a trained model with a shareable
predictor page and a REST endpoint.

```
 Browser ──► Next.js (Vercel) ──► /api/v1/models/<id>/predict ──► Cloudflare tunnel ──► FastAPI (your machine)
                │                                                                           ▲
                └── Supabase: auth, training_jobs table, datasets/models storage ◄── worker ┘
```

- **frontend/** — Next.js app (dashboard, upload flow, predictor pages, public API route).
- **main.py** — FastAPI prediction server. **worker.py** — trains queued jobs.
  **preprocessing.py / model.py** — the scikit-learn pipeline.
- **supabase/** — database schema and storage config.

## Run the backend

Needs Docker. One-time: `cp .env.example .env` and fill in your Supabase URL and
**service role** key. Then:

```bash
docker compose up -d --build
```

That starts three containers: the API, the training worker, and a Cloudflare quick
tunnel. The API looks up its tunnel URL and publishes it to Supabase Storage
(`runtime/api.json`). The frontend reads it from there, so after a restart there's no
URL to copy, no env var to update, and nothing to redeploy. The dashboard shows
**Backend online** within a few seconds.

```bash
docker compose logs -f api worker   # watch it work
docker compose down                 # stop
```

## Run the frontend

```bash
cd frontend
cp .env.example .env.local   # Supabase URL + anon key
npm install
npm run dev
```

On Vercel, set only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
(`NEXT_PUBLIC_ML_API_URL` and `NEXT_PUBLIC_SITE_URL` are no longer used.)

## Supabase setup (new project)

1. Run the SQL in `supabase/migrations/` (SQL editor, or `supabase db push`).
2. Create private storage buckets `datasets` and `models` (see `supabase/config.toml`).
   The public `runtime` bucket is created by the backend automatically.
3. Enable the Google auth provider and add your site's `/auth/callback` URL to the
   allowed redirect URLs.

## Public API

```bash
curl -X POST https://<your-site>/api/v1/models/<model-id>/predict \
  -H "Content-Type: application/json" \
  -d '{"features": {"Pclass": 3, "Sex": "male", "Age": 25}}'
```

Missing numeric features are filled with the training median. `GET /api/v1/models/<id>`
returns the model's metrics and input schema.

## Tests

```bash
docker compose run --rm --no-deps -v "$PWD:/app" api sh -c "pip install -q pytest && pytest -q"
```
