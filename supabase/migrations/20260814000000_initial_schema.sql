-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Training jobs table
create table public.training_jobs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  dataset_name  text not null,
  dataset_path  text not null,
  target_column text not null,
  model_type    text not null check (model_type in (
    'logistic_regression',
    'random_forest_classifier',
    'linear_regression',
    'random_forest_regressor'
  )),
  status        text not null default 'pending' check (status in (
    'pending',
    'processing',
    'ready',
    'failed'
  )),
  model_path    text,
  metrics       jsonb,
  error_message text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
before update on public.training_jobs
for each row execute function update_updated_at();

-- Row Level Security
alter table public.training_jobs enable row level security;

-- Users can view their own jobs
create policy "Users can view their own jobs"
  on public.training_jobs for select
  using (auth.uid() = user_id);

-- Users can insert their own jobs
create policy "Users can insert their own jobs"
  on public.training_jobs for insert
  with check (auth.uid() = user_id);

-- Service role (worker) can update any job (used by worker.py via service_role key)
create policy "Service role can update jobs"
  on public.training_jobs for update
  using (true);
