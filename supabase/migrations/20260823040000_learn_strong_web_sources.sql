alter table public.app_settings
  add column if not exists discovery_source_learning_enabled boolean not null default true,
  add column if not exists discovery_learned_sources jsonb not null default '[]'::jsonb;

alter table public.app_settings
  drop constraint if exists app_settings_discovery_learned_sources_array_check,
  add constraint app_settings_discovery_learned_sources_array_check
    check (jsonb_typeof(discovery_learned_sources) = 'array');

comment on column public.app_settings.discovery_source_learning_enabled is
  'When enabled, web-discovered roles scoring 80 or above teach the scout which employer and ATS hosts produce strong matches.';

comment on column public.app_settings.discovery_learned_sources is
  'Bounded source-quality summaries. Reusable Greenhouse and Lever roots are promoted into discovery_source_urls; other ATS hosts remain web-monitored.';
