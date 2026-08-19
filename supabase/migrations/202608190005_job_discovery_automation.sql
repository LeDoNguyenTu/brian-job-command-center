create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

alter table public.app_settings
  add column if not exists discovery_enabled boolean not null default true,
  add column if not exists discovery_time time not null default '08:00',
  add column if not exists discovery_timezone text not null default 'Asia/Singapore',
  add column if not exists discovery_source_urls text[] not null default '{}',
  add column if not exists last_discovery_at timestamptz,
  add column if not exists last_scheduled_discovery_date date,
  add column if not exists discovery_status text not null default 'Waiting for sources',
  add column if not exists discovery_message text;

alter table public.jobs
  add column if not exists dedupe_key text,
  add column if not exists source_external_id text,
  add column if not exists last_seen_at timestamptz;

create or replace function private.normalize_job_url(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(value), '') is null then null
    else lower(regexp_replace(split_part(split_part(trim(value), '#', 1), '?', 1), '/+$', ''))
  end;
$$;

revoke all on function private.normalize_job_url(text) from public;

create or replace function private.set_job_dedupe_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.dedupe_key := private.normalize_job_url(new.job_url);
  return new;
end;
$$;

revoke all on function private.set_job_dedupe_key() from public;

drop trigger if exists set_job_dedupe_key_before_write on public.jobs;
create trigger set_job_dedupe_key_before_write
before insert or update of job_url on public.jobs
for each row execute function private.set_job_dedupe_key();

update public.jobs
set dedupe_key = private.normalize_job_url(job_url)
where job_url is not null;

create unique index if not exists jobs_dedupe_key_unique_idx
on public.jobs (dedupe_key);

create table if not exists private.discovery_config (
  id smallint primary key default 1 check (id = 1),
  function_url text,
  updated_at timestamptz not null default now()
);

revoke all on private.discovery_config from public, anon, authenticated;
grant all on private.discovery_config to service_role;

insert into private.discovery_config (id)
values (1)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'job_discovery_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'job_discovery_cron_secret',
      'Authenticates the private scheduled job discovery request'
    );
  end if;
end;
$$;

create or replace function public.read_job_discovery_cron_secret_for_service()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  secret_value text;
begin
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name = 'job_discovery_cron_secret'
  limit 1;

  return secret_value;
end;
$$;

revoke all on function public.read_job_discovery_cron_secret_for_service() from public, anon, authenticated;
grant execute on function public.read_job_discovery_cron_secret_for_service() to service_role;

select cron.schedule(
  'brian-job-discovery-runner',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := config.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', secrets.decrypted_secret
      ),
      body := '{"action":"scheduled"}'::jsonb
    )
    from private.discovery_config as config
    cross join vault.decrypted_secrets as secrets
    where config.id = 1
      and config.function_url is not null
      and secrets.name = 'job_discovery_cron_secret';
  $cron$
);
