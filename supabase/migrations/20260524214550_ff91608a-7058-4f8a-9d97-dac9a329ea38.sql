-- 1) Helper: is_diretor (no schema app_private, padrão dos demais)
CREATE OR REPLACE FUNCTION app_private.is_diretor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'diretor'::public.app_role)
$$;
GRANT EXECUTE ON FUNCTION app_private.is_diretor(uuid) TO authenticated;

-- 2) Diretor (Gerente Geral) lê tudo: amplia políticas SELECT existentes
DROP POLICY IF EXISTS "sales select scoped" ON public.sales;
CREATE POLICY "sales select scoped" ON public.sales
FOR SELECT TO authenticated
USING (
  app_private.is_admin(auth.uid())
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_diretor(auth.uid())
  OR (EXISTS (
    SELECT 1 FROM broker_mapping bm
    WHERE bm.user_id = auth.uid()
      AND bm.ativo = true
      AND lower(btrim(bm.corretor_nome)) = lower(btrim(COALESCE(sales.corretor, '')))
  ))
  OR (
    app_private.is_gerente(auth.uid())
    AND app_private.gerente_nome_of(auth.uid()) IS NOT NULL
    AND lower(btrim(COALESCE(gerente, ''))) = app_private.gerente_nome_of(auth.uid())
  )
);

-- profiles: diretor pode listar
DROP POLICY IF EXISTS "profiles select staff" ON public.profiles;
CREATE POLICY "profiles select staff" ON public.profiles
FOR SELECT TO authenticated
USING (app_private.is_admin(auth.uid()) OR app_private.is_financeiro(auth.uid()) OR app_private.is_diretor(auth.uid()));

-- distratos: diretor lê todos
DROP POLICY IF EXISTS "distratos select own or staff" ON public.distratos;
CREATE POLICY "distratos select own or staff" ON public.distratos
FOR SELECT TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
  OR app_private.is_diretor(auth.uid())
);

-- commission_requests: diretor lê todos
DROP POLICY IF EXISTS "select cr own or staff" ON public.commission_requests;
CREATE POLICY "select cr own or staff" ON public.commission_requests
FOR SELECT TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
  OR app_private.is_diretor(auth.uid())
);

-- nf_requests: diretor lê todos
DROP POLICY IF EXISTS "select nf own or staff" ON public.nf_requests;
CREATE POLICY "select nf own or staff" ON public.nf_requests
FOR SELECT TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
  OR app_private.is_diretor(auth.uid())
);

-- 3) Suporte a pedidos do diretor em commission_requests
ALTER TABLE public.commission_requests
  ADD COLUMN IF NOT EXISTS diretor_user_id uuid;

-- Amplia insert para permitir requester_role = 'diretor'
DROP POLICY IF EXISTS "insert cr own pending" ON public.commission_requests;
CREATE POLICY "insert cr own pending" ON public.commission_requests
FOR INSERT TO authenticated
WITH CHECK (
  status = 'pendente'::request_status
  AND (
    (requester_role = 'corretor' AND corretor_user_id = auth.uid())
    OR (requester_role = 'gerente' AND gerente_user_id = auth.uid() AND app_private.is_gerente(auth.uid()))
    OR (requester_role = 'diretor' AND diretor_user_id = auth.uid() AND app_private.is_diretor(auth.uid()))
  )
);

-- SELECT inclui diretor próprio também
DROP POLICY IF EXISTS "select cr own or staff" ON public.commission_requests;
CREATE POLICY "select cr own or staff" ON public.commission_requests
FOR SELECT TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR diretor_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
  OR app_private.is_diretor(auth.uid())
);