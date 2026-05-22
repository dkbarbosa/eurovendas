
-- 1) Profiles: restrict broad read of emails
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;

CREATE POLICY "profiles select self"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY "profiles select staff"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()));

-- 2) commission_requests: allow admins to update
CREATE POLICY "update cr by admin"
ON public.commission_requests FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3) Storage: restrict NF file deletion to staff
DROP POLICY IF EXISTS "Brokers delete own NF files" ON storage.objects;

CREATE POLICY "Staff delete NF files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nf-files'
  AND (public.is_financeiro(auth.uid()) OR public.is_admin(auth.uid()))
);
