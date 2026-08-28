select cron.schedule(
  'brian-job-discovery-runner',
  '* * * * *',
  $cron$
    select net.http_post(
      url := config.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', secrets.decrypted_secret
      ),
      body := '{"action":"scheduled"}'::jsonb
    )
    from private.discovery_config as config
    cross join vault.decrypted_secrets as secrets
    where config.id = 1
      and config.function_url is not null
      and secrets.name = 'job_discovery_cron_secret';
  $cron$
);