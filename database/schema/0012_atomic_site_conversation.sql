-- Create a site conversation and its first message as one transaction.
-- The function applies the same site-membership rules as the table policies;
-- SECURITY DEFINER does not make caller-supplied site IDs trusted.

create function public.create_site_conversation_with_message(
  p_site_id uuid,
  p_title   text,
  p_body    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_home_site_id uuid;
  v_is_active boolean;
  v_site_id uuid;
  v_conversation public.site_conversations;
  v_message public.site_messages;
begin
  if v_user_id is null then
    raise exception 'Sign in to create a conversation' using errcode = '28000';
  end if;

  select p.role, p.home_site_id, p.is_active
    into v_role, v_home_site_id, v_is_active
    from public.profiles p
   where p.id = v_user_id;

  if not found or not v_is_active then
    raise exception 'An active account is required' using errcode = '42501';
  end if;

  if v_role in ('employee', 'manager') then
    if v_home_site_id is null then
      raise exception 'Your account has no home site' using errcode = '42501';
    end if;
    if p_site_id is not null and p_site_id <> v_home_site_id then
      raise exception 'You cannot create a conversation for another site' using errcode = '42501';
    end if;
    v_site_id := v_home_site_id;
  elsif v_role = 'admin' then
    if p_site_id is null then
      raise exception 'Choose a site before creating a conversation' using errcode = '22023';
    end if;
    if not public.admin_can_access_site(p_site_id) then
      raise exception 'The site is outside your administrator scope' using errcode = '42501';
    end if;
    v_site_id := p_site_id;
  else
    raise exception 'Unsupported account role' using errcode = '42501';
  end if;

  if p_title is null or length(btrim(p_title)) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Message must be between 1 and 2000 characters' using errcode = '22023';
  end if;

  insert into public.site_conversations (site_id, created_by, title)
  values (v_site_id, v_user_id, btrim(p_title))
  returning * into v_conversation;

  insert into public.site_messages (conversation_id, sender_id, body)
  values (v_conversation.id, v_user_id, btrim(p_body))
  returning * into v_message;

  return jsonb_build_object(
    'conversation', to_jsonb(v_conversation),
    'message', to_jsonb(v_message)
  );
end;
$$;

revoke execute on function public.create_site_conversation_with_message(uuid, text, text)
  from public, anon;
grant execute on function public.create_site_conversation_with_message(uuid, text, text)
  to authenticated;
