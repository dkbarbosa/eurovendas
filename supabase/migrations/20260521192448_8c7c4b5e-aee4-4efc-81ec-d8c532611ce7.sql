
insert into storage.buckets (id, name, public) values ('nf-files', 'nf-files', false)
on conflict (id) do nothing;

create policy "Brokers upload own NF files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nf-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Brokers read own NF files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nf-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(), 'financeiro')
    or public.has_role(auth.uid(), 'admin')
  )
);

create policy "Brokers delete own NF files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nf-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
