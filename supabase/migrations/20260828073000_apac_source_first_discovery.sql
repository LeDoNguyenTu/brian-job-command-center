create table if not exists public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  display_name text not null,
  canonical_url text not null unique,
  employer_host text,
  source_class text not null check (source_class in ('direct_structured', 'generic_employer', 'verified_board')),
  provider text not null default 'unknown',
  adapter text not null,
  detector_confidence numeric(4,3) not null default 0 check (detector_confidence between 0 and 1),
  fingerprint_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(fingerprint_evidence) = 'array' and pg_column_size(fingerprint_evidence) <= 16384),
  market_codes text[] not null default array['SG']::text[],
  location_aliases text[] not null default '{}'::text[],
  adapter_config jsonb not null default '{}'::jsonb check (jsonb_typeof(adapter_config) = 'object' and pg_column_size(adapter_config) <= 32768),
  trust_level text not null default 'official' check (trust_level in ('official', 'verified_board')),
  enabled boolean not null default true,
  crawl_interval_minutes integer not null default 120 check (crawl_interval_minutes between 15 and 10080),
  next_crawl_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_attempted_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error_summary text check (last_error_summary is null or char_length(last_error_summary) <= 1000),
  discovered_via text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discovery_runs (
  id bigint generated always as identity primary key,
  action text not null check (action in ('scheduled', 'manual', 'dry-run', 'maintenance', 'diagnostic')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_attempted integer not null default 0,
  sources_succeeded integer not null default 0,
  sources_failed integer not null default 0,
  verified_open integer not null default 0,
  inserted integer not null default 0,
  refreshed integer not null default 0,
  closed integer not null default 0,
  quarantined integer not null default 0,
  sources_learned integer not null default 0,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 65536),
  error_summary text check (error_summary is null or char_length(error_summary) <= 2000)
);

create table if not exists public.discovery_quarantine (
  id bigint generated always as identity primary key,
  source_url text not null,
  reason text not null check (char_length(reason) <= 1000),
  provider text,
  source_class text,
  candidate jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate) = 'object' and pg_column_size(candidate) <= 65536),
  discovered_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.jobs add column if not exists source_id uuid references public.discovery_sources(id) on delete set null;
alter table public.jobs add column if not exists provider_job_id text;
alter table public.jobs add column if not exists canonical_url text;
alter table public.jobs add column if not exists posted_at timestamptz;
alter table public.jobs add column if not exists first_seen_at timestamptz;
alter table public.jobs add column if not exists last_seen_at timestamptz;
alter table public.jobs add column if not exists last_verified_at timestamptz;
alter table public.jobs add column if not exists availability_status text;
alter table public.jobs add column if not exists availability_evidence text;
alter table public.jobs add column if not exists source_trust text;
alter table public.jobs add column if not exists source_class text;
alter table public.jobs add column if not exists market_code text;
alter table public.jobs add column if not exists missing_from_source_count integer not null default 0;

alter table public.app_settings add column if not exists discovery_markets text[] not null default array['SG']::text[];
update public.app_settings
set discovery_markets = array['SG']::text[]
where id = 1 and (discovery_markets is null or cardinality(discovery_markets) = 0);

create index if not exists discovery_sources_due_idx
  on public.discovery_sources (next_crawl_at, id)
  where enabled = true;

create unique index if not exists jobs_source_provider_job_id_uidx
  on public.jobs (source_id, provider_job_id)
  where source_id is not null and provider_job_id is not null;

create unique index if not exists jobs_canonical_url_uidx
  on public.jobs (canonical_url)
  where canonical_url is not null;

create index if not exists jobs_verified_discovered_idx
  on public.jobs (pipeline, availability_status, market_code, posted_at desc);

alter table public.discovery_sources enable row level security;
alter table public.discovery_runs enable row level security;
alter table public.discovery_quarantine enable row level security;

drop policy if exists "Admin can read discovery sources" on public.discovery_sources;
create policy "Admin can read discovery sources"
  on public.discovery_sources for select to authenticated
  using ((select public.is_current_admin()));

drop policy if exists "Admin can read discovery runs" on public.discovery_runs;
create policy "Admin can read discovery runs"
  on public.discovery_runs for select to authenticated
  using ((select public.is_current_admin()));

drop policy if exists "Admin can read discovery quarantine" on public.discovery_quarantine;
create policy "Admin can read discovery quarantine"
  on public.discovery_quarantine for select to authenticated
  using ((select public.is_current_admin()));

grant select on public.discovery_sources, public.discovery_runs, public.discovery_quarantine to authenticated;

create or replace function public.lease_discovery_sources(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.discovery_sources
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select source.id
    from public.discovery_sources as source
    where source.enabled = true
      and source.next_crawl_at <= now()
      and (source.lease_expires_at is null or source.lease_expires_at < now())
    order by source.next_crawl_at asc, source.id asc
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  )
  update public.discovery_sources as source
  set lease_expires_at = now() + make_interval(secs => least(greatest(p_lease_seconds, 30), 600)),
      last_attempted_at = now(),
      updated_at = now()
  from picked
  where source.id = picked.id
  returning source.*;
end;
$$;

revoke all on function public.lease_discovery_sources(integer, integer) from public;
revoke all on function public.lease_discovery_sources(integer, integer) from anon;
revoke all on function public.lease_discovery_sources(integer, integer) from authenticated;
grant execute on function public.lease_discovery_sources(integer, integer) to service_role;

with legacy_urls as (
  select distinct trim(source_url) as source_url
  from public.app_settings settings
  cross join lateral unnest(coalesce(settings.discovery_source_urls, '{}'::text[])) as source_url
  where settings.id = 1 and trim(source_url) <> ''
), normalized as (
  select
    source_url,
    nullif(split_part(regexp_replace(source_url, '^https?://[^/]+/?', '', 'i'), '/', 1), '') as slug
  from legacy_urls
)
insert into public.discovery_sources (
  company, display_name, canonical_url, source_class, provider, adapter,
  detector_confidence, fingerprint_evidence, market_codes, trust_level,
  crawl_interval_minutes, discovered_via
)
select
  coalesce(initcap(replace(replace(slug, '-', ' '), '_', ' ')), 'Imported source'),
  coalesce(initcap(replace(replace(slug, '-', ' '), '_', ' ')), 'Imported source'),
  regexp_replace(source_url, '/+$', ''),
  'direct_structured',
  case
    when source_url ~* 'greenhouse\.io' then 'greenhouse'
    when source_url ~* 'lever\.co' then 'lever'
    else 'custom'
  end,
  case
    when source_url ~* 'greenhouse\.io' then 'greenhouse'
    when source_url ~* 'lever\.co' then 'lever'
    else 'generic_employer_html'
  end,
  case when source_url ~* '(greenhouse\.io|lever\.co)' then 0.99 else 0.65 end,
  jsonb_build_array('legacy_source_url'),
  array['SG']::text[],
  'official',
  120,
  'legacy_source_urls'
from normalized
on conflict (canonical_url) do nothing;

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
