revoke all on function public.store_notion_token(text) from public, anon, authenticated, service_role;
drop function public.store_notion_token(text);

create or replace function public.store_notion_token_for_service(token_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if token_value is null or char_length(trim(token_value)) < 20 or char_length(token_value) > 512 then
    raise exception 'Invalid Notion integration token';
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'brian_notion_token'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(trim(token_value), 'brian_notion_token', 'Brian Job Command Center Notion integration');
  else
    perform vault.update_secret(existing_id, trim(token_value), 'brian_notion_token', 'Brian Job Command Center Notion integration');
  end if;

  update public.app_settings
  set notion_connected = true,
      last_sync_status = 'Ready to sync',
      last_sync_message = 'Notion connection saved securely in Supabase Vault.',
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.store_notion_token_for_service(text) from public, anon, authenticated;
grant execute on function public.store_notion_token_for_service(text) to service_role;

