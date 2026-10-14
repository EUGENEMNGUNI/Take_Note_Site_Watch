-- 0006_storage.sql
-- Private storage for sick-leave documents (FR-11). Documents must never be
-- publicly reachable.
--
-- Object key convention (enforced by the policies below):
--   <employee_id>/<leave_request_id>/<file name>
--
-- Employees can upload into their own folder (for a pending request of theirs)
-- and read their own files. Administrators can read files of employees within
-- their scope; the server hands them time-limited signed URLs. Nobody except
-- the service role can update or delete objects, so a retention job (rules
-- still undecided) will run server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-documents',
  'leave-documents',
  false,
  10485760,  -- 10 MB, matches leave_documents_size_range
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path parsing helpers. They return NULL for anything that is not exactly
-- <uuid>/<uuid>/<file>, so malformed keys never match a policy.
create function public.leave_doc_employee_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

create function public.leave_doc_request_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

grant execute on function public.leave_doc_employee_id(text) to authenticated;
grant execute on function public.leave_doc_request_id(text)  to authenticated;
revoke execute on function public.leave_doc_employee_id(text) from public, anon;
revoke execute on function public.leave_doc_request_id(text)  from public, anon;

create policy leave_documents_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'leave-documents'
    and public.leave_doc_employee_id(name) = auth.uid()
    and exists (
      select 1
      from public.leave_requests r
      where r.id = public.leave_doc_request_id(name)
        and r.employee_id = auth.uid()
        and r.status = 'pending'
    )
  );

create policy leave_documents_read_own_or_scoped_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-documents'
    and (
      public.leave_doc_employee_id(name) = auth.uid()
      or public.admin_can_access_employee(public.leave_doc_employee_id(name))
    )
  );
