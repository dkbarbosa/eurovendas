
-- 1) Novas colunas
ALTER TABLE public.nf_requests
  ADD COLUMN IF NOT EXISTS requester_role text NOT NULL DEFAULT 'corretor',
  ADD COLUMN IF NOT EXISTS gerente_user_id uuid,
  ADD COLUMN IF NOT EXISTS diretor_user_id uuid;

ALTER TABLE public.nf_requests
  DROP CONSTRAINT IF EXISTS nf_requests_requester_role_check;
ALTER TABLE public.nf_requests
  ADD CONSTRAINT nf_requests_requester_role_check
  CHECK (requester_role IN ('corretor','gerente','diretor'));

-- 2) Índice único parcial: 1 NF ativa por (sale_id, requester_role)
DROP INDEX IF EXISTS public.nf_requests_active_unique;
CREATE UNIQUE INDEX nf_requests_active_unique
  ON public.nf_requests (sale_id, requester_role)
  WHERE status IN ('solicitada','emitida','recebida');

-- 3) Recria policies SELECT/UPDATE para incluir gerente/diretor como donos
DROP POLICY IF EXISTS "select nf own or staff" ON public.nf_requests;
CREATE POLICY "select nf own or staff"
  ON public.nf_requests
  FOR SELECT
  TO authenticated
  USING (
    corretor_user_id = auth.uid()
    OR gerente_user_id = auth.uid()
    OR diretor_user_id = auth.uid()
    OR app_private.is_financeiro(auth.uid())
    OR app_private.is_admin(auth.uid())
    OR app_private.is_diretor(auth.uid())
  );

DROP POLICY IF EXISTS "update nf owner or financeiro" ON public.nf_requests;
CREATE POLICY "update nf owner or financeiro"
  ON public.nf_requests
  FOR UPDATE
  TO authenticated
  USING (
    corretor_user_id = auth.uid()
    OR gerente_user_id = auth.uid()
    OR diretor_user_id = auth.uid()
    OR app_private.is_financeiro(auth.uid())
  )
  WITH CHECK (
    corretor_user_id = auth.uid()
    OR gerente_user_id = auth.uid()
    OR diretor_user_id = auth.uid()
    OR app_private.is_financeiro(auth.uid())
  );
