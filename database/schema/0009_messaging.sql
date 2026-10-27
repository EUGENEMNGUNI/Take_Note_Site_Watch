-- 0009_messaging.sql
-- Site-scoped internal messaging for employees, managers and administrators.

create table public.site_conversations (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,
  title      text not null check (length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_conversations_site_updated_idx
  on public.site_conversations (site_id, updated_at desc);

create index site_conversations_created_by_idx
  on public.site_conversations (created_by, created_at desc);

create table public.site_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.site_conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete restrict,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

create index site_messages_conversation_created_idx
  on public.site_messages (conversation_id, created_at asc);

create trigger site_conversations_set_updated_at
  before update on public.site_conversations
  for each row execute function public.set_updated_at();

alter table public.site_conversations enable row level security;
alter table public.site_messages enable row level security;

revoke all on public.site_conversations from anon, authenticated;
revoke all on public.site_messages from anon, authenticated;

grant select, insert on public.site_conversations to authenticated;
grant select, insert on public.site_messages to authenticated;

create policy site_conversations_select on public.site_conversations
  for select to authenticated
  using (
    public.admin_can_access_site(site_id)
    or public.manager_can_access_site(site_id)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.home_site_id = site_conversations.site_id
        and p.is_active
    )
  );

create policy site_conversations_insert on public.site_conversations
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and (
      public.admin_can_access_site(site_id)
      or public.manager_can_access_site(site_id)
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.home_site_id = site_conversations.site_id
          and p.is_active
      )
    )
  );

create policy site_messages_select on public.site_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.site_conversations c
      where c.id = conversation_id
        and (
          public.admin_can_access_site(c.site_id)
          or public.manager_can_access_site(c.site_id)
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.home_site_id = c.site_id
              and p.is_active
          )
        )
    )
  );

create policy site_messages_insert on public.site_messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.site_conversations c
      where c.id = conversation_id
        and (
          public.admin_can_access_site(c.site_id)
          or public.manager_can_access_site(c.site_id)
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.home_site_id = c.site_id
              and p.is_active
          )
        )
    )
  );
