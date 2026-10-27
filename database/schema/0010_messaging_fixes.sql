-- 0010_messaging_fixes.sql
-- Two fixes for the messaging tables added in 0009:
--
--   1. site_conversations.updated_at was never bumped when a message was
--      posted (clients have no UPDATE privilege on the table), so threads did
--      not sort by latest activity. A trigger now does it.
--   2. Sender names were read through a join on profiles, but an employee may
--      not read other people's profiles, so colleagues' names came back blank.
--      message_sender_names() returns ONLY id and full_name, and only for the
--      senders in conversations the caller is allowed to see.

create function public.bump_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.site_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger site_messages_bump_conversation
  after insert on public.site_messages
  for each row execute function public.bump_conversation_updated_at();

create function public.message_sender_names(p_conversation_ids uuid[])
returns table (sender_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, p.full_name
  from public.site_messages m
  join public.site_conversations c on c.id = m.conversation_id
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = any (p_conversation_ids)
    and (
      public.admin_can_access_site(c.site_id)
      or public.manager_can_access_site(c.site_id)
      or exists (
        select 1
        from public.profiles me
        where me.id = auth.uid()
          and me.is_active
          and me.home_site_id = c.site_id
      )
    );
$$;

revoke execute on function public.message_sender_names(uuid[]) from public, anon;
grant execute on function public.message_sender_names(uuid[]) to authenticated;
