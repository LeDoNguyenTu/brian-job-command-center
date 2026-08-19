alter table public.app_settings
  add column if not exists session_timeout_minutes smallint not null default 60;

alter table public.app_settings
  drop constraint if exists app_settings_session_timeout_minutes_check;

alter table public.app_settings
  add constraint app_settings_session_timeout_minutes_check
  check (session_timeout_minutes in (15, 30, 60, 120, 480));

update public.app_settings
set session_timeout_minutes = 60,
    updated_at = now()
where id = 1
  and session_timeout_minutes not in (15, 30, 60, 120, 480);
