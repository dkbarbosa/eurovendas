-- 1. Migra diretores para gerente (sem duplicar se já forem gerente)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'gerente'::public.app_role
FROM public.user_roles
WHERE role = 'diretor'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'diretor';

-- 2. Adiciona gerente_nome ao broker_mapping
ALTER TABLE public.broker_mapping
  ADD COLUMN IF NOT EXISTS gerente_nome text;

-- 3. Helpers
CREATE OR REPLACE FUNCTION app_private.is_gerente(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.has_role(_user_id, 'gerente'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION app_private.gerente_nome_of(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(btrim(gerente_nome))
  FROM public.broker_mapping
  WHERE user_id = _user_id AND ativo = true AND gerente_nome IS NOT NULL
  LIMIT 1
$$;

-- 4. Reescreve policy de SELECT em sales: admin/financeiro/corretor próprio/gerente do time
DROP POLICY IF EXISTS "sales select own or staff" ON public.sales;

CREATE POLICY "sales select scoped"
ON public.sales
FOR SELECT
TO authenticated
USING (
  app_private.is_admin(auth.uid())
  OR app_private.is_financeiro(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.broker_mapping bm
    WHERE bm.user_id = auth.uid()
      AND bm.ativo = true
      AND lower(btrim(bm.corretor_nome)) = lower(btrim(COALESCE(sales.corretor, '')))
  )
  OR (
    app_private.is_gerente(auth.uid())
    AND app_private.gerente_nome_of(auth.uid()) IS NOT NULL
    AND lower(btrim(COALESCE(sales.gerente, ''))) = app_private.gerente_nome_of(auth.uid())
  )
);