-- 0005_leave.sql
-- Sick-leave requests, supporting documents and administrator review
-- (FR-10, FR-11, FR-12).
--
-- Employees may insert their own pending requests directly (column-level
-- grant, so they cannot set status or reviewer fields). All later changes go
-- through cancel_leave_request() and review_leave_request().

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles (id) on delete restrict,
  leave_type    public.leave_type not null default 'sick',
  start_date    date not null,
  end_date      date not null,
  reason        text,
  status        public.leave_status not null default 'pending',
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint leave_dates_ordered check (end_date >= start_date),
  constraint leave_reason_length check (reason is null or length(reason) <= 2000),
  constraint leave_note_length check (decision_note is null or length(decision_note) <= 2000)
);

create index leave_requests_employee_idx on public.leave_requests (employee_id, created_at desc);
create index leave_requests_status_idx   on public.leave_requests (status, created_at desc);

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

create table public.leave_documents (
  id               uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests (id) on delete cascade,
  employee_id      uuid not null references public.profiles (id) on delete restrict,
  -- Object key inside the private 'leave-documents' bucket:
  --   <employee_id>/<leave_request_id>/<file name>
  storage_path     text not null unique,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       integer not null,
  created_at       timestamptz not null default now(),
  constraint leave_documents_path_matches
    check (storage_path like employee_id::text || '/' || leave_request_id::text || '/%'),
  constraint leave_documents_mime_allowed
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint leave_documents_size_range
    check (size_bytes between 1 and 10485760),
  constraint leave_documents_name_not_blank
    check (length(btrim(file_name)) > 0)
);

create index leave_documents_request_idx on public.leave_documents (leave_request_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public.cancel_leave_request(p_request_id uuid)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.leave_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_row
    from public.leave_requests
   where id = p_request_id and employee_id = auth.uid()
   for update;
  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled' using errcode = '22023';
  end if;

  update public.leave_requests
     set status = 'cancelled'
   where id = p_request_id
  returning * into v_row;
  return v_row;
end;
$$;

create function public.review_leave_request(
  p_request_id uuid,
  p_decision   public.leave_status,
  p_note       text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.leave_requests;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  select * into v_row
    from public.leave_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;
  if v_row.employee_id = auth.uid() then
    raise exception 'You cannot review your own leave request' using errcode = '42501';
  end if;
  if not public.admin_can_access_employee(v_row.employee_id) then
    raise exception 'Request is outside your scope' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending requests can be reviewed' using errcode = '22023';
  end if;

  update public.leave_requests
     set status = p_decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         decision_note = p_note
   where id = p_request_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Audit: new requests and every status change (FR-15).
create function public.audit_leave_requests_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit('leave.submitted', 'leave_request', new.id::text,
      jsonb_build_object('employee_id', new.employee_id,
                         'start_date', new.start_date, 'end_date', new.end_date));
  elsif new.status is distinct from old.status then
    perform public.record_audit('leave.' || new.status::text, 'leave_request', new.id::text,
      jsonb_build_object('employee_id', new.employee_id, 'from', old.status));
  end if;
  return new;
end;
$$;

create trigger leave_requests_audit
  after insert or update on public.leave_requests
  for each row execute function public.audit_leave_requests_changes();

create function public.audit_leave_documents_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_audit('leave.document_added', 'leave_request',
    new.leave_request_id::text,
    jsonb_build_object('document_id', new.id, 'mime_type', new.mime_type));
  return new;
end;
$$;

create trigger leave_documents_audit
  after insert on public.leave_documents
  for each row execute function public.audit_leave_documents_changes();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

alter table public.leave_requests  enable row level security;
alter table public.leave_documents enable row level security;

revoke all on public.leave_requests  from anon, authenticated;
revoke all on public.leave_documents from anon, authenticated;

grant select on public.leave_requests to authenticated;
-- Column-level insert: status, reviewer and decision columns keep their
-- defaults, so a client cannot submit an already-approved request.
grant insert (employee_id, leave_type, start_date, end_date, reason)
  on public.leave_requests to authenticated;

grant select on public.leave_documents to authenticated;
grant insert (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
  on public.leave_documents to authenticated;

create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (employee_id = auth.uid() or public.admin_can_access_employee(employee_id));

create policy leave_requests_insert_own on public.leave_requests
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  );

create policy leave_documents_select on public.leave_documents
  for select to authenticated
  using (employee_id = auth.uid() or public.admin_can_access_employee(employee_id));

-- Documents can be attached only by the request's owner, and only while the
-- request is still pending.
create policy leave_documents_insert_own on public.leave_documents
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and exists (
      select 1
      from public.leave_requests r
      where r.id = leave_request_id
        and r.employee_id = auth.uid()
        and r.status = 'pending'
    )
  );

revoke execute on function public.cancel_leave_request(uuid) from public, anon;
revoke execute on function public.review_leave_request(uuid, public.leave_status, text)
  from public, anon;
grant execute on function public.cancel_leave_request(uuid) to authenticated;
grant execute on function public.review_leave_request(uuid, public.leave_status, text)
  to authenticated;
