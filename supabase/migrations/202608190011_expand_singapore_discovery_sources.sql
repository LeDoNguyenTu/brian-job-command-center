update public.app_settings
set discovery_source_urls = (
      select array_agg(source_url order by first_seen)
      from (
        select source_url, min(ordinality) as first_seen
        from unnest(
          coalesce(discovery_source_urls, array[]::text[]) || array[
            'https://job-boards.greenhouse.io/cloudflare',
            'https://job-boards.greenhouse.io/reolink',
            'https://job-boards.greenhouse.io/zscaler',
            'https://job-boards.greenhouse.io/clickhouse',
            'https://job-boards.greenhouse.io/pagerduty',
            'https://job-boards.greenhouse.io/couchbaseinc',
            'https://job-boards.greenhouse.io/dragos',
            'https://job-boards.greenhouse.io/airtrunk',
            'https://job-boards.greenhouse.io/twilio',
            'https://job-boards.greenhouse.io/heygen',
            'https://job-boards.greenhouse.io/elwoodtechnologies',
            'https://jobs.lever.co/sonarsource',
            'https://jobs.lever.co/lalamove',
            'https://jobs.lever.co/ninjavan',
            'https://jobs.lever.co/kpler',
            'https://jobs.lever.co/octoenergy'
          ]
        ) with ordinality as source_list(source_url, ordinality)
        group by source_url
      ) as deduplicated_sources
    ),
    discovery_status = case when discovery_enabled then 'Scheduled' else 'Paused' end,
    discovery_message = 'Singapore company career source coverage expanded.',
    updated_at = now()
where id = 1;
