create or replace function private.enforce_web_discovery_employer_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_host text;
  employer_host text;
begin
  if new.discovered_via like 'web_search:%'
     and new.source_class = 'generic_employer'
     and new.provider in ('generic', 'custom')
     and new.trust_level = 'official' then
    source_host := lower(split_part(split_part(new.canonical_url, '://', 2), '/', 1));
    source_host := split_part(source_host, ':', 1);
    source_host := regexp_replace(source_host, '^www\.', '');

    employer_host := lower(regexp_replace(coalesce(new.employer_host, ''), '^www\.', ''));

    if employer_host = ''
       or employer_host = source_host
       or source_host not like '%.' || employer_host then
      raise exception 'Generic web-discovered source requires external employer parent-host evidence'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_web_discovery_employer_ownership() from public;
grant execute on function private.enforce_web_discovery_employer_ownership() to postgres, service_role;

drop trigger if exists discovery_sources_enforce_web_ownership on public.discovery_sources;
create trigger discovery_sources_enforce_web_ownership
before insert or update of canonical_url, employer_host, source_class, provider, trust_level, discovered_via
on public.discovery_sources
for each row
execute function private.enforce_web_discovery_employer_ownership();
