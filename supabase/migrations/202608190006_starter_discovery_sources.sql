update public.app_settings
set discovery_source_urls = array[
      'https://job-boards.greenhouse.io/simplifynext',
      'https://job-boards.greenhouse.io/adyen',
      'https://job-boards.greenhouse.io/okx',
      'https://jobs.lever.co/wintermute-trading',
      'https://jobs.lever.co/weride'
    ],
    discovery_status = 'Scheduled',
    discovery_message = 'Starter company career boards are ready for the first live run.',
    updated_at = now()
where id = 1
  and cardinality(discovery_source_urls) = 0;
