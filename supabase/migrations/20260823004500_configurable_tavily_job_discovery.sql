alter table public.app_settings
  add column if not exists discovery_location text not null default 'Singapore',
  add column if not exists discovery_country text not null default 'singapore',
  add column if not exists discovery_web_search_provider text not null default 'tavily',
  add column if not exists discovery_monthly_credit_cap smallint not null default 900,
  add column if not exists discovery_last_credit_usage integer,
  add column if not exists discovery_last_credit_limit integer;

alter table public.app_settings
  drop constraint if exists app_settings_discovery_location_check,
  add constraint app_settings_discovery_location_check
    check (char_length(trim(discovery_location)) between 2 and 120),
  drop constraint if exists app_settings_discovery_country_check,
  add constraint app_settings_discovery_country_check
    check (char_length(trim(discovery_country)) between 2 and 80),
  drop constraint if exists app_settings_discovery_web_search_provider_check,
  add constraint app_settings_discovery_web_search_provider_check
    check (discovery_web_search_provider = 'tavily'),
  drop constraint if exists app_settings_discovery_monthly_credit_cap_check,
  add constraint app_settings_discovery_monthly_credit_cap_check
    check (discovery_monthly_credit_cap between 100 and 1000);

update public.app_settings
set discovery_search_queries = array[
      'graduate junior entry level software developer engineer',
      'graduate junior entry level cybersecurity SOC analyst',
      'graduate junior entry level IT support helpdesk',
      'graduate junior entry level cloud network infrastructure'
    ]::text[],
    discovery_web_search_provider = 'tavily',
    discovery_web_search_configured = false,
    discovery_message = 'Add a free Tavily API key to enable broad web discovery across ATS and company career sites.',
    updated_at = now()
where id = 1;

create or replace function private.store_web_search_key_internal(key_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if trim(coalesce(key_value, '')) !~ '^tvly-[A-Za-z0-9_-]{16,}$'
    or char_length(key_value) > 4096 then
    raise exception 'Enter a valid Tavily API key beginning with tvly-';
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'job_web_search_key'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      trim(key_value),
      'job_web_search_key',
      'Private Tavily API key for broad job discovery and page extraction'
    );
  else
    perform vault.update_secret(
      existing_id,
      trim(key_value),
      'job_web_search_key',
      'Private Tavily API key for broad job discovery and page extraction'
    );
  end if;

  update public.app_settings
  set discovery_web_search_provider = 'tavily',
      discovery_web_search_configured = true,
      discovery_web_search_enabled = true,
      discovery_message = 'Tavily web discovery is configured.',
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function private.store_web_search_key_internal(text) from public, anon;
grant execute on function private.store_web_search_key_internal(text) to authenticated;

