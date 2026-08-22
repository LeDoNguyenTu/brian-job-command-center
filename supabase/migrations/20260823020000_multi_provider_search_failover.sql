alter table public.app_settings
  add column if not exists discovery_tavily_configured boolean not null default false,
  add column if not exists discovery_exa_configured boolean not null default false,
  add column if not exists discovery_firecrawl_configured boolean not null default false,
  add column if not exists discovery_brave_configured boolean not null default false,
  add column if not exists discovery_serpapi_configured boolean not null default false,
  add column if not exists discovery_serper_configured boolean not null default false,
  add column if not exists discovery_provider_order text[] not null default array['tavily', 'exa', 'firecrawl', 'brave', 'serpapi', 'serper']::text[],
  add column if not exists discovery_last_provider text,
  add column if not exists discovery_provider_status jsonb not null default '[]'::jsonb;

alter table public.app_settings
  drop constraint if exists app_settings_discovery_web_search_provider_check,
  add constraint app_settings_discovery_web_search_provider_check
    check (discovery_web_search_provider in ('automatic', 'tavily', 'exa', 'firecrawl', 'brave', 'serpapi', 'serper')),
  drop constraint if exists app_settings_discovery_provider_order_check,
  add constraint app_settings_discovery_provider_order_check
    check (
      cardinality(discovery_provider_order) between 1 and 6
      and discovery_provider_order <@ array['tavily', 'exa', 'firecrawl', 'brave', 'serpapi', 'serper']::text[]
    );

update public.app_settings
set discovery_tavily_configured = discovery_web_search_configured,
    discovery_web_search_provider = 'automatic',
    discovery_provider_order = array['tavily', 'exa', 'firecrawl', 'brave', 'serpapi', 'serper']::text[],
    updated_at = now()
where id = 1;

create or replace function private.upsert_job_search_secret(
  secret_name text,
  secret_value text,
  secret_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  select id into existing_id
  from vault.secrets
  where name = secret_name
  limit 1;

  if existing_id is null then
    perform vault.create_secret(trim(secret_value), secret_name, secret_description);
  else
    perform vault.update_secret(existing_id, trim(secret_value), secret_name, secret_description);
  end if;
end;
$$;

create or replace function private.store_search_provider_keys_internal(
  tavily_key text default null,
  exa_key text default null,
  firecrawl_key text default null,
  brave_key text default null,
  serpapi_key text default null,
  serper_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_tavily boolean := nullif(trim(coalesce(tavily_key, '')), '') is not null;
  has_exa boolean := nullif(trim(coalesce(exa_key, '')), '') is not null;
  has_firecrawl boolean := nullif(trim(coalesce(firecrawl_key, '')), '') is not null;
  has_brave boolean := nullif(trim(coalesce(brave_key, '')), '') is not null;
  has_serpapi boolean := nullif(trim(coalesce(serpapi_key, '')), '') is not null;
  has_serper boolean := nullif(trim(coalesce(serper_key, '')), '') is not null;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not (has_tavily or has_exa or has_firecrawl or has_brave or has_serpapi or has_serper) then
    raise exception 'Paste at least one provider API key';
  end if;
  if has_tavily and (trim(tavily_key) !~ '^tvly-[A-Za-z0-9_-]{16,}$' or char_length(tavily_key) > 4096) then
    raise exception 'Enter a valid Tavily API key beginning with tvly-';
  end if;
  if has_brave and (char_length(trim(brave_key)) < 20 or char_length(brave_key) > 4096) then
    raise exception 'Enter a valid Brave Search API key';
  end if;
  if has_exa and (char_length(trim(exa_key)) < 16 or char_length(exa_key) > 4096) then
    raise exception 'Enter a valid Exa API key';
  end if;
  if has_firecrawl and (trim(firecrawl_key) !~ '^fc-[A-Za-z0-9_-]{12,}$' or char_length(firecrawl_key) > 4096) then
    raise exception 'Enter a valid Firecrawl API key beginning with fc-';
  end if;
  if has_serpapi and (char_length(trim(serpapi_key)) < 16 or char_length(serpapi_key) > 4096) then
    raise exception 'Enter a valid SerpApi key';
  end if;
  if has_serper and (char_length(trim(serper_key)) < 16 or char_length(serper_key) > 4096) then
    raise exception 'Enter a valid Serper API key';
  end if;

  if has_tavily then
    perform private.upsert_job_search_secret('job_web_search_key', tavily_key, 'Private Tavily key for job search and extraction');
  end if;
  if has_brave then
    perform private.upsert_job_search_secret('job_brave_search_key', brave_key, 'Private Brave Search key for job-search failover');
  end if;
  if has_exa then
    perform private.upsert_job_search_secret('job_exa_search_key', exa_key, 'Private Exa key for job-search failover and page contents');
  end if;
  if has_firecrawl then
    perform private.upsert_job_search_secret('job_firecrawl_search_key', firecrawl_key, 'Private Firecrawl key for job-search failover and page extraction');
  end if;
  if has_serpapi then
    perform private.upsert_job_search_secret('job_serpapi_search_key', serpapi_key, 'Private SerpApi key for Google-search failover');
  end if;
  if has_serper then
    perform private.upsert_job_search_secret('job_serper_search_key', serper_key, 'Private Serper key for Google-search failover');
  end if;

  update public.app_settings
  set discovery_tavily_configured = discovery_tavily_configured or has_tavily,
      discovery_exa_configured = discovery_exa_configured or has_exa,
      discovery_firecrawl_configured = discovery_firecrawl_configured or has_firecrawl,
      discovery_brave_configured = discovery_brave_configured or has_brave,
      discovery_serpapi_configured = discovery_serpapi_configured or has_serpapi,
      discovery_serper_configured = discovery_serper_configured or has_serper,
      discovery_web_search_configured = discovery_web_search_configured or has_tavily or has_exa or has_firecrawl or has_brave or has_serpapi or has_serper,
      discovery_web_search_enabled = true,
      discovery_web_search_provider = 'automatic',
      discovery_message = 'Automatic search-provider failover is configured.',
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.store_search_provider_keys(
  tavily_key text default null,
  exa_key text default null,
  firecrawl_key text default null,
  brave_key text default null,
  serpapi_key text default null,
  serper_key text default null
)
returns void
language sql
set search_path = ''
as $$
  select private.store_search_provider_keys_internal(tavily_key, exa_key, firecrawl_key, brave_key, serpapi_key, serper_key);
$$;

create or replace function public.read_search_provider_keys_for_service()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  keys jsonb;
begin
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'tavily', max(decrypted_secret) filter (where name = 'job_web_search_key'),
    'exa', max(decrypted_secret) filter (where name = 'job_exa_search_key'),
    'firecrawl', max(decrypted_secret) filter (where name = 'job_firecrawl_search_key'),
    'brave', max(decrypted_secret) filter (where name = 'job_brave_search_key'),
    'serpapi', max(decrypted_secret) filter (where name = 'job_serpapi_search_key'),
    'serper', max(decrypted_secret) filter (where name = 'job_serper_search_key')
  ) into keys
  from vault.decrypted_secrets
  where name in ('job_web_search_key', 'job_exa_search_key', 'job_firecrawl_search_key', 'job_brave_search_key', 'job_serpapi_search_key', 'job_serper_search_key');

  return coalesce(keys, '{}'::jsonb);
end;
$$;

revoke all on function private.upsert_job_search_secret(text, text, text) from public, anon, authenticated;
revoke all on function private.store_search_provider_keys_internal(text, text, text, text, text, text) from public, anon;
grant execute on function private.store_search_provider_keys_internal(text, text, text, text, text, text) to authenticated;
revoke all on function public.store_search_provider_keys(text, text, text, text, text, text) from public, anon;
grant execute on function public.store_search_provider_keys(text, text, text, text, text, text) to authenticated;
revoke all on function public.read_search_provider_keys_for_service() from public, anon, authenticated;
grant execute on function public.read_search_provider_keys_for_service() to service_role;
