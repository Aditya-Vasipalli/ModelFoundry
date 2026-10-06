-- Brings a fresh project in line with what the app uses. Safe to run more than once.

-- Input schema of each trained model (drives the generated prediction form)
alter table public.training_jobs add column if not exists features jsonb;

-- Owners can delete their models from the dashboard
drop policy if exists "Users can delete their own jobs" on public.training_jobs;
create policy "Users can delete their own jobs"
  on public.training_jobs for delete
  using (auth.uid() = user_id);

-- Only the backend (service role) may change job status/metrics. The original
-- policy had no role, so it applied to every signed-in user.
drop policy if exists "Service role can update jobs" on public.training_jobs;
create policy "Service role can update jobs"
  on public.training_jobs for update
  to service_role
  using (true);

-- Users upload datasets into a folder named after their user id
drop policy if exists "Users can upload datasets to their own folder" on storage.objects;
create policy "Users can upload datasets to their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'datasets' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public bucket where the backend publishes its tunnel URL + heartbeat.
-- (The backend also creates it automatically on first start.)
insert into storage.buckets (id, name, public)
values ('runtime', 'runtime', true)
on conflict (id) do nothing;
