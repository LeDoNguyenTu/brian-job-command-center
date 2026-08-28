create or replace function private.enforce_web_discovery_source_quality()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_lower text;
  source_host text;
  source_path text;
  source_slug text;
  role_like_title boolean;
  board_is_individual boolean := false;
begin
  if new.discovered_via not like 'web_search:%' then
    return new;
  end if;

  canonical_lower := lower(new.canonical_url);
  source_host := lower(split_part(split_part(new.canonical_url, '://', 2), '/', 1));
  source_host := split_part(source_host, ':', 1);
  source_host := regexp_replace(source_host, '^www\.', '');
  source_path := regexp_replace(canonical_lower, '^https?://[^/]+', '', 'i');

  if new.source_class = 'verified_board' then
    if source_host = 'indeed.com' or source_host like '%.indeed.com' then
      board_is_individual := canonical_lower ~ '([?&]jk=[^&]+)' or source_path ~ '^/viewjob(?:[/?]|$)';
    elsif source_host = 'linkedin.com' or source_host like '%.linkedin.com' then
      board_is_individual := source_path ~ '^/jobs/view/(?:[^/?]+-)?[0-9]+(?:[/?]|$)';
    elsif source_host = 'jobstreet.com' or source_host like '%.jobstreet.com'
       or source_host = 'jobstreet.com.sg' or source_host like '%.jobstreet.com.sg'
       or source_host = 'seek.com.au' or source_host like '%.seek.com.au' then
      board_is_individual := source_path ~ '^/job/[0-9]+(?:[/?]|$)';
    elsif source_host = 'mycareersfuture.gov.sg' or source_host like '%.mycareersfuture.gov.sg' then
      board_is_individual := source_path ~ '/job/' and source_path ~ '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    elsif source_host = 'glints.com' or source_host like '%.glints.com' then
      board_is_individual := source_path ~ '^/opportunities/jobs/';
    elsif source_host = 'itviec.com' or source_host like '%.itviec.com' then
      board_is_individual := source_path ~ '^/it-jobs/';
    elsif source_host = 'topcv.vn' or source_host like '%.topcv.vn' then
      board_is_individual := source_path ~ '^/viec-lam/' and source_path ~ '[0-9]+(?:\.html)?(?:[/?]|$)';
    elsif source_host = 'vietnamworks.com' or source_host like '%.vietnamworks.com' then
      board_is_individual := source_path ~ '(^|[-/])jv([-/?]|$)' or source_path ~ '^/job/';
    else
      board_is_individual := false;
    end if;

    if not board_is_individual then
      raise exception 'Verified job board source must be an individual vacancy listing'
        using errcode = '23514';
    end if;
  end if;

  role_like_title := coalesce(new.company, '') ~* '\m(engineer|developer|analyst|architect|intern|graduate|junior|senior|manager|specialist|consultant|support|devops|sre|software|cyber|security|cloud|data|programmer|technician)\M';

  if role_like_title
     and new.provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'teamtailor', 'workday') then
    if new.provider = 'workday' then
      source_slug := split_part(source_host, '.', 1);
    else
      source_slug := split_part(
        split_part(regexp_replace(new.canonical_url, '^https?://[^/]+/?', '', 'i'), '?', 1),
        '/',
        1
      );
    end if;

    source_slug := initcap(regexp_replace(coalesce(source_slug, ''), '[-_]+', ' ', 'g'));
    if source_slug <> '' then
      new.company := source_slug;
      new.display_name := source_slug;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_web_discovery_source_quality() from public;
grant execute on function private.enforce_web_discovery_source_quality() to postgres, service_role;

drop trigger if exists discovery_sources_enforce_web_source_quality on public.discovery_sources;
create trigger discovery_sources_enforce_web_source_quality
before insert or update of canonical_url, company, display_name, source_class, provider, discovered_via
on public.discovery_sources
for each row
execute function private.enforce_web_discovery_source_quality();
