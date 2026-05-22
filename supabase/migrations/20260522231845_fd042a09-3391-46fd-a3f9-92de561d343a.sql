CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION app_private.is_financeiro(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'financeiro'::public.app_role)
$$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_financeiro(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_financeiro(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "admin write broker_mapping" ON public.broker_mapping;
CREATE POLICY "admin write broker_mapping"
ON public.broker_mapping
FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "delete cr by admin" ON public.commission_requests;
CREATE POLICY "delete cr by admin"
ON public.commission_requests
FOR DELETE TO authenticated
USING (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "select cr own or staff" ON public.commission_requests;
CREATE POLICY "select cr own or staff"
ON public.commission_requests
FOR SELECT TO authenticated
USING (corretor_user_id = auth.uid() OR app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "update cr by admin" ON public.commission_requests;
CREATE POLICY "update cr by admin"
ON public.commission_requests
FOR UPDATE TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "update cr by financeiro" ON public.commission_requests;
CREATE POLICY "update cr by financeiro"
ON public.commission_requests
FOR UPDATE TO authenticated
USING (app_private.is_financeiro(auth.uid()))
WITH CHECK (app_private.is_financeiro(auth.uid()));

DROP POLICY IF EXISTS "admin write config" ON public.config_kv;
CREATE POLICY "admin write config"
ON public.config_kv
FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "delete nf by admin" ON public.nf_requests;
CREATE POLICY "delete nf by admin"
ON public.nf_requests
FOR DELETE TO authenticated
USING (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "insert nf by financeiro" ON public.nf_requests;
CREATE POLICY "insert nf by financeiro"
ON public.nf_requests
FOR INSERT TO authenticated
WITH CHECK (app_private.is_financeiro(auth.uid()) AND solicitado_por = auth.uid());

DROP POLICY IF EXISTS "select nf own or staff" ON public.nf_requests;
CREATE POLICY "select nf own or staff"
ON public.nf_requests
FOR SELECT TO authenticated
USING (corretor_user_id = auth.uid() OR app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "update nf owner or financeiro" ON public.nf_requests;
CREATE POLICY "update nf owner or financeiro"
ON public.nf_requests
FOR UPDATE TO authenticated
USING (corretor_user_id = auth.uid() OR app_private.is_financeiro(auth.uid()))
WITH CHECK (corretor_user_id = auth.uid() OR app_private.is_financeiro(auth.uid()));

DROP POLICY IF EXISTS "profiles select staff" ON public.profiles;
CREATE POLICY "profiles select staff"
ON public.profiles
FOR SELECT TO authenticated
USING (app_private.is_admin(auth.uid()) OR app_private.is_financeiro(auth.uid()));

DROP POLICY IF EXISTS "read audit by staff" ON public.request_audit_log;
CREATE POLICY "read audit by staff"
ON public.request_audit_log
FOR SELECT TO authenticated
USING (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin write sales" ON public.sales;
CREATE POLICY "admin write sales"
ON public.sales
FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "sales select own or staff" ON public.sales;
CREATE POLICY "sales select own or staff"
ON public.sales
FOR SELECT TO authenticated
USING (
  app_private.is_admin(auth.uid())
  OR app_private.is_financeiro(auth.uid())
  OR app_private.has_role(auth.uid(), 'diretor'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.broker_mapping bm
    WHERE bm.user_id = auth.uid()
      AND bm.ativo = true
      AND lower(btrim(bm.corretor_nome)) = lower(btrim(COALESCE(sales.corretor, '')))
  )
);

DROP POLICY IF EXISTS "admin write sync" ON public.sync_log;
CREATE POLICY "admin write sync"
ON public.sync_log
FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles"
ON public.user_roles
FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "user_roles select admin" ON public.user_roles;
CREATE POLICY "user_roles select admin"
ON public.user_roles
FOR SELECT TO authenticated
USING (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Brokers read own NF files" ON storage.objects;
CREATE POLICY "Brokers read own NF files"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'nf-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR app_private.has_role(auth.uid(), 'financeiro'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Brokers update own NF files" ON storage.objects;
CREATE POLICY "Brokers update own NF files"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'nf-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR app_private.has_role(auth.uid(), 'financeiro'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'nf-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR app_private.has_role(auth.uid(), 'financeiro'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff delete NF files" ON storage.objects;
CREATE POLICY "Staff delete NF files"
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'nf-files' AND (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid())));