-- ModelFoundry v2: more model types, training reports and progress, private models,
-- API keys, usage stats and per-user quotas. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- training_jobs: new columns
-- ---------------------------------------------------------------------------
alter table public.training_jobs
  add column if not exists features    jsonb,
  add column if not exists report      jsonb,
  add column if not exists options     jsonb not null default '{}'::jsonb,
  add column if not exists progress    jsonb,
  add column if not exists attempts    integer not null default 0,
  add column if not exists is_public   boolean not null default true,
  add column if not exists started_at  timestamptz,
  add column if not exists finished_at timestamptz;

-- Replace the old model_type / status checks (whatever they were named)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.training_jobs'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%model_type%' or pg_get_constraintdef(oid) ilike '%status%'
           or pg_get_constraintdef(oid) ilike '%dataset_name%')
  loop
    execute format('alter table public.training_jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.training_jobs add constraint training_jobs_model_type_check check (model_type in (
  'auto_classifier', 'auto_regressor',
  'logistic_regression', 'random_forest_classifier', 'gradient_boosting_classifier', 'extra_trees_classifier',
  'decision_tree_classifier', 'knn_classifier', 'svm_classifier', 'naive_bayes_classifier',
  'linear_regression', 'ridge_regression', 'lasso_regression', 'random_forest_regressor',
  'gradient_boosting_regressor', 'extra_trees_regressor', 'decision_tree_regressor', 'knn_regressor',
  'svm_regressor'
));
alter table public.training_jobs add constraint training_jobs_status_check
  check (status in ('pending', 'processing', 'ready', 'failed', 'cancelled'));
alter table public.training_jobs add constraint training_jobs_dataset_name_check
  check (char_length(dataset_name) between 1 and 120);

create index if not exists training_jobs_user_created_idx on public.training_jobs (user_id, created_at desc);
create index if not exists training_jobs_queue_idx on public.training_jobs (attempts, created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- training_jobs: who may change what
-- ---------------------------------------------------------------------------
-- Owners can rename, change visibility and cancel. Everything else is written
-- by the backend with the service role (which bypasses RLS and these checks).
drop policy if exists "Service role can update jobs" on public.training_jobs;
drop policy if exists "Owners can update their jobs" on public.training_jobs;
create policy "Owners can update their jobs"
  on public.training_jobs for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own jobs" on public.training_jobs;
create policy "Users can delete their own jobs"
  on public.training_jobs for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.guard_training_jobs()
returns trigger language plpgsql as $$
declare
  active_count integer;
  total_count integer;
begin
  -- Only signed-in users are restricted; the backend runs as service_role
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.metrics := null; new.report := null; new.features := null; new.model_path := null;
    new.progress := null; new.attempts := 0; new.error_message := null;
    new.started_at := null; new.finished_at := null;

    select count(*) filter (where status in ('pending', 'processing')), count(*)
      into active_count, total_count
      from public.training_jobs where user_id = new.user_id;
    if total_count >= 50 then
      raise exception 'You have reached the limit of 50 models. Delete one to train a new model.';
    end if;
    if active_count >= 3 then
      raise exception 'You already have 3 models training. Wait for one to finish.';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status
     and not (new.status = 'cancelled' and old.status in ('pending', 'processing')) then
    raise exception 'Only unfinished models can be cancelled.';
  end if;
  if (new.user_id, new.dataset_path, new.target_column, new.model_type, new.model_path, new.metrics,
      new.report, new.features, new.options, new.attempts, new.progress, new.error_message,
      new.started_at, new.finished_at, new.created_at)
     is distinct from
     (old.user_id, old.dataset_path, old.target_column, old.model_type, old.model_path, old.metrics,
      old.report, old.features, old.options, old.attempts, old.progress, old.error_message,
      old.started_at, old.finished_at, old.created_at) then
    raise exception 'Only the name and visibility of a model can be changed.';
  end if;
  return new;
end $$;

drop trigger if exists guard_training_jobs on public.training_jobs;
create trigger guard_training_jobs
  before insert or update on public.training_jobs
  for each row execute function public.guard_training_jobs();

-- ---------------------------------------------------------------------------
-- API keys (only a SHA-256 hash is stored; the key is shown once on creation)
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  prefix       text not null,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id);
alter table public.api_keys enable row level security;

drop policy if exists "Users can view their API keys" on public.api_keys;
create policy "Users can view their API keys"
  on public.api_keys for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create API keys" on public.api_keys;
create policy "Users can create API keys"
  on public.api_keys for insert to authenticated
  with check (auth.uid() = user_id and (select count(*) from public.api_keys k where k.user_id = auth.uid()) < 10);
drop policy if exists "Users can delete their API keys" on public.api_keys;
create policy "Users can delete their API keys"
  on public.api_keys for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Prediction usage (written by the backend, readable by the model's owner)
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_events (
  id         bigint generated always as identity primary key,
  model_id   uuid not null references public.training_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  source     text not null default 'api' check (source in ('web', 'share', 'api', 'batch')),
  rows       integer not null default 1,
  latency_ms integer,
  ok         boolean not null default true
);
create index if not exists prediction_events_model_time_idx on public.prediction_events (model_id, created_at desc);
alter table public.prediction_events enable row level security;

drop policy if exists "Owners can read usage of their models" on public.prediction_events;
create policy "Owners can read usage of their models"
  on public.prediction_events for select to authenticated
  using (exists (select 1 from public.training_jobs j where j.id = model_id and j.user_id = auth.uid()));

create or replace function public.model_usage(p_model_id uuid, p_days integer default 14)
returns table (day date, predictions bigint, requests bigint, errors bigint, avg_latency_ms integer)
language sql stable as $$
  select (created_at at time zone 'utc')::date,
         coalesce(sum(rows) filter (where ok), 0)::bigint,
         count(*)::bigint,
         count(*) filter (where not ok)::bigint,
         avg(latency_ms)::integer
  from public.prediction_events
  where model_id = p_model_id and created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
$$;
grant execute on function public.model_usage(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Owners can download their trained model files
drop policy if exists "Owners can download their models" on storage.objects;
create policy "Owners can download their models"
  on storage.objects for select to authenticated
  using (bucket_id = 'models' and exists (
    select 1 from public.training_jobs j
    where j.user_id = auth.uid() and j.model_path = storage.objects.name
  ));

-- Users upload datasets into a folder named after their user id
drop policy if exists "Users can upload datasets to their own folder" on storage.objects;
create policy "Users can upload datasets to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'datasets' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('runtime', 'runtime', true)
on conflict (id) do nothing;
