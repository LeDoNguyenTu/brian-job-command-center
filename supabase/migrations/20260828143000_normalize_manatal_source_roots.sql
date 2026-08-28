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
  source_path text;
  source_slug text;
  path_parts text[];
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

  if provider_name = 'manatal'
     and (source_host = 'careers-page.com' or source_host like '%.careers-page.com') then
    if source_host = 'careers-page.com' then
      source_path := split_part(regexp_replace(source_url, '^https?://[^/]+/?', '', 'i'), '?', 1);
      path_parts := string_to_array(trim(both '/' from source_path), '/');
      source_slug := coalesce(path_parts[1], '');
      if lower(source_slug) in ('job', 'jobs', 'career', 'careers') then
        source_slug := '';
      end if;
    else
      source_slug := regexp_replace(source_host, '\.careers-page\.com$', '', 'i');
    end if;

    source_slug := btrim(source_slug);
    if source_slug <> '' and lower(source_slug) <> 'www' then
      return 'https://www.careers-page.com/' || source_slug;
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

  if new.provider = 'manatal' then
    new.employer_host := 'www.careers-page.com';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discovery_source_canonical_url() from public;
grant execute on function private.enforce_discovery_source_canonical_url() to postgres, service_role;

update public.discovery_sources
set canonical_url = private.normalize_discovery_source_canonical_url(canonical_url, provider),
    employer_host = case when provider = 'manatal' then 'www.careers-page.com' else employer_host end,
    updated_at = now()
where provider = 'manatal';
