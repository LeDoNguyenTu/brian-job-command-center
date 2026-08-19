alter table public.app_settings
  add column if not exists primary_data_source text not null default 'Supabase',
  add column if not exists last_backup_at timestamptz,
  add column if not exists backup_status text not null default 'Not configured',
  add column if not exists backup_message text;

alter table public.resumes
  add column if not exists storage_path text,
  add column if not exists original_filename text;

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
       or (
         user_id is null
         and email = lower(coalesce((select auth.jwt())->>'email', ''))
       )
  );
$$;

revoke all on function private.is_app_admin() from public;
grant execute on function private.is_app_admin() to authenticated, service_role;

create or replace function private.link_admin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.app_admins
  set email = lower(new.email),
      user_id = new.id,
      linked_at = coalesce(linked_at, now())
  where user_id = new.id
     or (user_id is null and email = lower(new.email));

  return new;
end;
$$;

revoke all on function private.link_admin_user() from public;

update public.app_settings
set primary_data_source = 'Supabase',
    backup_status = case when notion_connected then 'Ready' else 'Not configured' end,
    backup_message = case
      when notion_connected then 'Notion is connected as an optional backup.'
      else 'Supabase is live. Notion backup has not been configured.'
    end,
    updated_at = now()
where id = 1;
