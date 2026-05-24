
-- commission_requests: pedidos podem ser de corretor ou gerente
ALTER TABLE public.commission_requests
  ADD COLUMN IF NOT EXISTS requester_role text NOT NULL DEFAULT 'corretor',
  ADD COLUMN IF NOT EXISTS gerente_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_cr_requester_role ON public.commission_requests (requester_role);
CREATE INDEX IF NOT EXISTS idx_cr_gerente_user_id ON public.commission_requests (gerente_user_id);

-- Atualiza RLS de SELECT para incluir gerente
DROP POLICY IF EXISTS "select cr own or staff" ON public.commission_requests;
CREATE POLICY "select cr own or staff"
ON public.commission_requests
FOR SELECT
TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
);

-- Atualiza INSERT para permitir gerente criar pedido próprio
DROP POLICY IF EXISTS "insert cr own pending" ON public.commission_requests;
CREATE POLICY "insert cr own pending"
ON public.commission_requests
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pendente'
  AND (
    (requester_role = 'corretor' AND corretor_user_id = auth.uid())
    OR (requester_role = 'gerente' AND gerente_user_id = auth.uid()
        AND app_private.is_gerente(auth.uid()))
  )
);

-- distratos: snapshot do gerente afetado
ALTER TABLE public.distratos
  ADD COLUMN IF NOT EXISTS gerente_user_id uuid,
  ADD COLUMN IF NOT EXISTS gerente_nome text,
  ADD COLUMN IF NOT EXISTS valor_comissao_gerente numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_adiantamento_gerente numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_comissao_final_gerente numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_distratos_gerente_user_id ON public.distratos (gerente_user_id);

DROP POLICY IF EXISTS "distratos select own or staff" ON public.distratos;
CREATE POLICY "distratos select own or staff"
ON public.distratos
FOR SELECT
TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
);

-- distrato_descontos: pode estar vinculado a comissão de gerente
ALTER TABLE public.distrato_descontos
  ADD COLUMN IF NOT EXISTS gerente_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_dd_gerente_user_id ON public.distrato_descontos (gerente_user_id);

DROP POLICY IF EXISTS "dd select own or staff" ON public.distrato_descontos;
CREATE POLICY "dd select own or staff"
ON public.distrato_descontos
FOR SELECT
TO authenticated
USING (
  corretor_user_id = auth.uid()
  OR gerente_user_id = auth.uid()
  OR app_private.is_financeiro(auth.uid())
  OR app_private.is_admin(auth.uid())
);
