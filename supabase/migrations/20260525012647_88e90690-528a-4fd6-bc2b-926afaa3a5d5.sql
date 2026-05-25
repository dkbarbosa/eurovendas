-- Per-beneficiary distrato breakdown (Corretor / Gerente / Gestão)
CREATE TABLE public.distrato_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distrato_id uuid NOT NULL REFERENCES public.distratos(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL CHECK (role IN ('corretor','gerente','diretor')),
  nome text,
  valor_devolver numeric NOT NULL DEFAULT 0,
  valor_devolvido numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','devolvido','quitado_por_desconto','cancelado')),
  devolvido_at timestamptz,
  devolvido_por uuid,
  observacao_recebimento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distrato_id, role, user_id)
);

CREATE INDEX idx_distrato_recipients_distrato ON public.distrato_recipients(distrato_id);
CREATE INDEX idx_distrato_recipients_user ON public.distrato_recipients(user_id);

ALTER TABLE public.distrato_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr select own or staff"
  ON public.distrato_recipients FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR app_private.is_financeiro(auth.uid())
    OR app_private.is_admin(auth.uid())
    OR app_private.is_diretor(auth.uid())
  );

CREATE POLICY "dr insert by financeiro"
  ON public.distrato_recipients FOR INSERT TO authenticated
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

CREATE POLICY "dr update by financeiro"
  ON public.distrato_recipients FOR UPDATE TO authenticated
  USING (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

CREATE POLICY "dr delete by admin"
  ON public.distrato_recipients FOR DELETE TO authenticated
  USING (app_private.is_admin(auth.uid()));

CREATE TRIGGER trg_distrato_recipients_updated_at
  BEFORE UPDATE ON public.distrato_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
