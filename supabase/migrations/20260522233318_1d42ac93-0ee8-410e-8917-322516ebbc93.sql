
-- Enum para status de distrato
DO $$ BEGIN
  CREATE TYPE public.distrato_status AS ENUM ('pendente_devolucao', 'devolvido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Adicionar valor 'distratado' ao enum request_status, se ainda não existe
DO $$ BEGIN
  ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'distratado';
EXCEPTION WHEN others THEN NULL; END $$;

-- Tabela distratos
CREATE TABLE IF NOT EXISTS public.distratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  corretor_user_id uuid,
  corretor_nome text,
  comprador text,
  empreendimento text,
  unidade text,
  valor_devolver numeric NOT NULL DEFAULT 0,
  valor_adiantamento numeric NOT NULL DEFAULT 0,
  valor_comissao_final numeric NOT NULL DEFAULT 0,
  motivo text,
  observacao_financeiro text,
  observacao_recebimento text,
  status public.distrato_status NOT NULL DEFAULT 'pendente_devolucao',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  devolvido_at timestamptz,
  devolvido_por uuid
);

CREATE INDEX IF NOT EXISTS idx_distratos_corretor ON public.distratos(corretor_user_id);
CREATE INDEX IF NOT EXISTS idx_distratos_sale ON public.distratos(sale_id);
CREATE INDEX IF NOT EXISTS idx_distratos_status ON public.distratos(status);
CREATE INDEX IF NOT EXISTS idx_distratos_created ON public.distratos(created_at DESC);

ALTER TABLE public.distratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "distratos select own or staff" ON public.distratos;
CREATE POLICY "distratos select own or staff" ON public.distratos
  FOR SELECT TO authenticated
  USING (
    corretor_user_id = auth.uid()
    OR app_private.is_financeiro(auth.uid())
    OR app_private.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "distratos insert by financeiro" ON public.distratos;
CREATE POLICY "distratos insert by financeiro" ON public.distratos
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "distratos update by financeiro" ON public.distratos;
CREATE POLICY "distratos update by financeiro" ON public.distratos
  FOR UPDATE TO authenticated
  USING (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "distratos delete by admin" ON public.distratos;
CREATE POLICY "distratos delete by admin" ON public.distratos
  FOR DELETE TO authenticated
  USING (app_private.is_admin(auth.uid()));

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_distratos_updated_at ON public.distratos;
CREATE TRIGGER trg_distratos_updated_at
  BEFORE UPDATE ON public.distratos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
