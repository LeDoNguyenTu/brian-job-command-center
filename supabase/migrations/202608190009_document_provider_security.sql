create index if not exists generated_documents_source_resume_idx
on public.generated_documents (source_resume_code);

create or replace function private.store_document_provider_config_internal(
  provider_value text,
  key_value text,
  model_value text,
  endpoint_value text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_provider text := lower(trim(coalesce(provider_value, '')));
  normalized_model text := trim(coalesce(model_value, ''));
  normalized_endpoint text := nullif(trim(coalesce(endpoint_value, '')), '');
  existing_id uuid;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if normalized_provider not in ('gemini', 'openai_compatible') then
    raise exception 'Unsupported document provider';
  end if;

  if char_length(trim(coalesce(key_value, ''))) < 16 or char_length(key_value) > 4096 then
    raise exception 'Enter a valid provider key';
  end if;

  if char_length(normalized_model) < 2 or char_length(normalized_model) > 160 then
    raise exception 'Enter a valid model name';
  end if;

  if normalized_provider = 'openai_compatible' then
    if normalized_endpoint is null or normalized_endpoint !~ '^https://[^[:space:]]+$' then
      raise exception 'A secure HTTPS endpoint is required for an OpenAI-compatible provider';
    end if;
    if char_length(normalized_endpoint) > 1000 then
      raise exception 'Provider endpoint is too long';
    end if;
  else
    normalized_endpoint := null;
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'document_provider_key'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      trim(key_value),
      'document_provider_key',
      'Private key for on-demand resume and cover letter generation'
    );
  else
    perform vault.update_secret(
      existing_id,
      trim(key_value),
      'document_provider_key',
      'Private key for on-demand resume and cover letter generation'
    );
  end if;

  update public.app_settings
  set document_provider = normalized_provider,
      document_model = normalized_model,
      document_endpoint = normalized_endpoint,
      document_provider_configured = true,
      document_provider_updated_at = now(),
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function private.store_document_provider_config_internal(text, text, text, text) from public, anon;
grant execute on function private.store_document_provider_config_internal(text, text, text, text) to authenticated;

create or replace function public.store_document_provider_config(
  provider_value text,
  key_value text,
  model_value text,
  endpoint_value text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.store_document_provider_config_internal(provider_value, key_value, model_value, endpoint_value);
$$;

revoke all on function public.store_document_provider_config(text, text, text, text) from public, anon;
grant execute on function public.store_document_provider_config(text, text, text, text) to authenticated;

create or replace function private.clear_document_provider_config_internal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'document_provider_key'
  limit 1;

  if existing_id is not null then
    delete from vault.secrets where id = existing_id;
  end if;

  update public.app_settings
  set document_provider_configured = false,
      document_provider_updated_at = now(),
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function private.clear_document_provider_config_internal() from public, anon;
grant execute on function private.clear_document_provider_config_internal() to authenticated;

create or replace function public.clear_document_provider_config()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.clear_document_provider_config_internal();
$$;

revoke all on function public.clear_document_provider_config() from public, anon;
grant execute on function public.clear_document_provider_config() to authenticated;
