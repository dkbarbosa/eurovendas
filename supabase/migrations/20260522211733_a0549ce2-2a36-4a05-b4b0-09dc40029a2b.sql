-- 1. Tighten sales SELECT: staff see all, brokers see only their own sales
DROP POLICY IF EXISTS "auth read sales" ON public.sales;

CREATE POLICY "sales select own or staff"
ON public.sales FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_financeiro(auth.uid())
  OR public.has_role(auth.uid(), 'diretor'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.broker_mapping bm
    WHERE bm.user_id = auth.uid()
      AND bm.ativo = true
      AND lower(btrim(bm.corretor_nome)) = lower(btrim(COALESCE(sales.corretor, '')))
  )
);

-- 2. Tighten user_roles SELECT: own roles only; admins see all
DROP POLICY IF EXISTS "auth read roles" ON public.user_roles;

CREATE POLICY "user_roles select own"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_roles select admin"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- 3. Remove tables from realtime publication (app does not use realtime for these)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.commission_requests;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.nf_requests;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. Add explicit UPDATE policy on nf-files storage bucket
DROP POLICY IF EXISTS "Brokers update own NF files" ON storage.objects;
CREATE POLICY "Brokers update own NF files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nf-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  bucket_id = 'nf-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'admin')
  )
);