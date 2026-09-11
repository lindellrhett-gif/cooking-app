-- Private bucket for receipt photos. Objects are stored at
--   {household_id}/{scan_id}.jpg
-- so the first path segment is what the policies gate on.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,  -- 10 MB. The client downscales before upload; this is the backstop.
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- A path whose first segment is not a UUID would otherwise raise inside a
-- policy, which surfaces as an opaque storage error rather than a clean denial.
create or replace function public.safe_uuid(t text)
returns uuid
language plpgsql
immutable
set search_path = pg_temp
as $fn$
begin
  return t::uuid;
exception
  when others then return null;
end;
$fn$;

create policy receipts_read on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy receipts_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
  );
