create or replace function private.normalize_discovery_source_canonical_url(
  source_url text,
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
  source_slug text;
begin
  if source_url is null or btrim(source_url) = '' then
    return source_url;
  end if;

  source_host := lower(split_part(split_part(source_url, '://', 2), '/', 1));
  source_host := split_part(source_host, ':', 1);
  source_host := regexp_replace(source_host, '^www\.', '');

  if provider_name = 'greenhouse'
     and (source_host = 'greenhouse.io' or source_host like '%.greenhouse.io') then
    source_slug := split_part(
      split_part(regexp_replace(source_url, '^https?://[^/]+/?', '', 'i'), '?', 1),
      '/',
      1
    );
    source_slug := btrim(source_slug);
    if source_slug <> '' then
      return 'https://job-boards.greenhouse.io/' || source_slug;
    end if;
  end if;

  return regexp_replace(source_url, '/$', '');
end;
$$;

revoke all on function private.normalize_discovery_source_canonical_url(text, text) from public;
grant execute on function private.normalize_discovery_source_canonical_url(text, text) to postgres, service_role;

create or replace function private.enforce_discovery_source_canonical_url()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.canonical_url := private.normalize_discovery_source_canonical_url(new.canonical_url, new.provider);

  if new.provider = 'greenhouse'
     and lower(coalesce(new.employer_host, '')) in ('boards.greenhouse.io', 'job-boards.greenhouse.io') then
    new.employer_host := 'job-boards.greenhouse.io';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discovery_source_canonical_url() from public;
grant execute on function private.enforce_discovery_source_canonical_url() to postgres, service_role;

drop trigger if exists discovery_sources_normalize_canonical_url on public.discovery_sources;
create trigger discovery_sources_normalize_canonical_url
before insert or update of canonical_url, provider, employer_host
on public.discovery_sources
for each row
execute function private.enforce_discovery_source_canonical_url();
