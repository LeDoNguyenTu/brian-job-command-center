alter table public.app_settings
  add column if not exists discovery_web_search_enabled boolean not null default true,
  add column if not exists discovery_web_search_configured boolean not null default false,
  add column if not exists discovery_search_queries text[] not null default array[
    'graduate junior entry level software developer engineer Singapore',
    'graduate junior entry level cybersecurity SOC analyst Singapore',
    'graduate junior entry level IT support helpdesk Singapore',
    'graduate junior entry level cloud network infrastructure Singapore'
  ]::text[],
  add column if not exists discovery_max_required_years smallint not null default 1;

alter table public.app_settings
  drop constraint if exists app_settings_discovery_max_required_years_check,
  add constraint app_settings_discovery_max_required_years_check
    check (discovery_max_required_years between 0 and 5);

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

  if char_length(trim(coalesce(key_value, ''))) < 20 or char_length(key_value) > 4096 then
    raise exception 'Enter a valid Brave Search API key';
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'job_web_search_key'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      trim(key_value),
      'job_web_search_key',
      'Private Brave Search API key for broad job discovery'
    );
  else
    perform vault.update_secret(
      existing_id,
      trim(key_value),
      'job_web_search_key',
      'Private Brave Search API key for broad job discovery'
    );
  end if;

  update public.app_settings
  set discovery_web_search_configured = true,
      discovery_web_search_enabled = true,
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.store_web_search_key(key_value text)
returns void
language sql
set search_path = ''
as $$
  select private.store_web_search_key_internal(key_value);
$$;

create or replace function public.read_web_search_key_for_service()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key_value text;
begin
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select decrypted_secret into key_value
  from vault.decrypted_secrets
  where name = 'job_web_search_key'
  limit 1;

  return key_value;
end;
$$;

revoke all on function private.store_web_search_key_internal(text) from public, anon;
grant execute on function private.store_web_search_key_internal(text) to authenticated;
revoke all on function public.store_web_search_key(text) from public, anon;
grant execute on function public.store_web_search_key(text) to authenticated;
revoke all on function public.read_web_search_key_for_service() from public, anon, authenticated;
grant execute on function public.read_web_search_key_for_service() to service_role;
