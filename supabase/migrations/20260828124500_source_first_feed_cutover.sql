create or replace function public.sync_source_first_feed_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_id is not null then
    new.date_found := new.posted_at::date;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_sync_source_first_feed_date on public.jobs;
create trigger jobs_sync_source_first_feed_date
before insert or update of posted_at, source_id on public.jobs
for each row
execute function public.sync_source_first_feed_date();

update public.jobs
set date_found = posted_at::date,
    updated_at = now()
where source_id is not null
  and date_found is distinct from posted_at::date;

update public.jobs
set pipeline = 'Blocked',
    match_level = 'Blocked',
    approved_to_apply = false,
    gaps_risks = case
      when coalesce(gaps_risks, '') ilike 'Legacy unverified discovery%'
        then gaps_risks
      else concat_ws('; ', 'Legacy unverified discovery - hidden from active queue after source-first cutover', nullif(gaps_risks, ''))
    end,
    updated_at = now()
where pipeline = 'Discovered'
  and source_id is null
  and saved is not true
  and approved_to_apply is not true
  and source ilike '%web discovery%';
