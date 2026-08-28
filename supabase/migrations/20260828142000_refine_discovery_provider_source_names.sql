create or replace function private.refine_discovery_provider_source_name(
  company_name text,
  canonical_url text,
  provider_name text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  source_host text;
  source_path text;
  path_parts text[];
  source_site text;
  source_slug text;
begin
  if canonical_url is null or btrim(canonical_url) = '' then
    return company_name;
  end if;

  source_host := lower(split_part(split_part(canonical_url, '://', 2), '/', 1));
  source_host := split_part(source_host, ':', 1);
  source_host := regexp_replace(source_host, '^www\.', '');

  if provider_name = 'manatal' and source_host like '%.careers-page.com' then
    source_slug := regexp_replace(source_host, '\.careers-page\.com$', '', 'i');
    source_slug := initcap(regexp_replace(coalesce(source_slug, ''), '[-_]+', ' ', 'g'));
    return case when btrim(source_slug) = '' then company_name else source_slug end;
  end if;

  if provider_name = 'workday' and source_host like '%.myworkdayjobs.com' then
    source_path := split_part(regexp_replace(canonical_url, '^https?://[^/]+/?', '', 'i'), '?', 1);
    path_parts := string_to_array(trim(both '/' from source_path), '/');
    source_site := case
      when coalesce(path_parts[1], '') ~ '^[a-z]{2}-[A-Z]{2}$' then coalesce(path_parts[2], '')
      else coalesce(path_parts[1], '')
    end;

    if lower(source_site) in ('external', 'career', 'careers', 'job', 'jobs', 'opportunities', 'career-site') then
      return company_name;
    end if;

    source_slug := regexp_replace(source_site, '(careers?|jobs?)$', '', 'i');
    if char_length(source_slug) < 2 then
      source_slug := source_site;
    end if;
    source_slug := initcap(regexp_replace(coalesce(source_slug, ''), '[-_]+', ' ', 'g'));
    return case when btrim(source_slug) = '' then company_name else source_slug end;
  end if;

  return company_name;
end;
$$;

revoke all on function private.refine_discovery_provider_source_name(text, text, text) from public;
grant execute on function private.refine_discovery_provider_source_name(text, text, text) to postgres, service_role;

create or replace function private.refine_discovery_provider_source_name_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  refined_name text;
begin
  if new.discovered_via not like 'web_search:%' then
    return new;
  end if;

  refined_name := private.refine_discovery_provider_source_name(new.company, new.canonical_url, new.provider);
  if refined_name is distinct from new.company then
    new.company := refined_name;
    new.display_name := refined_name;
  end if;

  return new;
end;
$$;

revoke all on function private.refine_discovery_provider_source_name_trigger() from public;
grant execute on function private.refine_discovery_provider_source_name_trigger() to postgres, service_role;

drop trigger if exists discovery_sources_refine_provider_source_name on public.discovery_sources;
create trigger discovery_sources_refine_provider_source_name
before insert or update of canonical_url, company, display_name, provider, discovered_via
on public.discovery_sources
for each row
execute function private.refine_discovery_provider_source_name_trigger();

update public.discovery_sources
set company = private.refine_discovery_provider_source_name(company, canonical_url, provider),
    display_name = private.refine_discovery_provider_source_name(company, canonical_url, provider),
    updated_at = now()
where discovered_via like 'web_search:%'
  and provider in ('workday', 'manatal');
