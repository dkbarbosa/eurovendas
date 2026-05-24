
-- broker_mapping: replace blanket auth read with scoped policy
DROP POLICY IF EXISTS "auth read broker_mapping" ON public.broker_mapping;

CREATE POLICY "broker_mapping select scoped"
ON public.broker_mapping
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR app_private.is_admin(auth.uid())
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_diretor(auth.uid())
  OR app_private.is_gerente(auth.uid())
);

-- config_kv: restrict reads to admin only
DROP POLICY IF EXISTS "auth read config" ON public.config_kv;

CREATE POLICY "config_kv select admin"
ON public.config_kv
FOR SELECT
TO authenticated
USING (app_private.is_admin(auth.uid()));

-- sync_log: restrict reads to admin only
DROP POLICY IF EXISTS "auth read sync" ON public.sync_log;

CREATE POLICY "sync_log select admin"
ON public.sync_log
FOR SELECT
TO authenticated
USING (app_private.is_admin(auth.uid()));
