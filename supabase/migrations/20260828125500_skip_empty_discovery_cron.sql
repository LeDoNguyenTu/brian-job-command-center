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
      and secrets.name = 'job_discovery_cron_secret'
      and exists (
        select 1
        from public.app_settings as settings
        where settings.id = 1
          and settings.discovery_enabled is true
          and (
            exists (
              select 1
              from public.discovery_sources as source
              where source.enabled is true
                and source.next_crawl_at <= now()
                and (source.lease_expires_at is null or source.lease_expires_at <= now())
            )
            or (
              settings.last_scheduled_discovery_date is distinct from
                (now() at time zone coalesce(nullif(settings.discovery_timezone, ''), 'Asia/Singapore'))::date
              and (now() at time zone coalesce(nullif(settings.discovery_timezone, ''), 'Asia/Singapore'))::time >= settings.discovery_time
            )
          )
      );
  $cron$
);
