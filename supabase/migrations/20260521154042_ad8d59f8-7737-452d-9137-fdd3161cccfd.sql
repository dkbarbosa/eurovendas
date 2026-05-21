
-- Função has_role para financeiro
CREATE OR REPLACE FUNCTION public.is_financeiro(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'financeiro'::app_role)
$$;

-- Garante função util de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- broker_mapping
CREATE TABLE public.broker_mapping (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  corretor_nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_broker_mapping_nome ON public.broker_mapping(corretor_nome);
ALTER TABLE public.broker_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read broker_mapping" ON public.broker_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write broker_mapping" ON public.broker_mapping
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Enums
CREATE TYPE public.request_type AS ENUM ('adiantamento', 'comissao_final');
CREATE TYPE public.request_status AS ENUM ('pendente', 'aprovado', 'negado', 'pago');
CREATE TYPE public.nf_status AS ENUM ('solicitada', 'emitida', 'recebida', 'cancelada');

-- commission_requests
CREATE TABLE public.commission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  tipo request_type NOT NULL DEFAULT 'adiantamento',
  valor_sinal numeric NOT NULL DEFAULT 0 CHECK (valor_sinal >= 0),
  bonus_corretor numeric NOT NULL DEFAULT 0 CHECK (bonus_corretor >= 0),
  valor_solicitado numeric NOT NULL CHECK (valor_solicitado >= 0),
  observacao_corretor text,
  status request_status NOT NULL DEFAULT 'pendente',
  motivo_negacao text,
  observacao_financeiro text,
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motivo_when_negado CHECK (
    (status <> 'negado') OR (motivo_negacao IS NOT NULL AND length(trim(motivo_negacao)) > 0)
  )
);
CREATE INDEX idx_cr_corretor ON public.commission_requests(corretor_user_id);
CREATE INDEX idx_cr_status ON public.commission_requests(status);
CREATE INDEX idx_cr_sale ON public.commission_requests(sale_id);
CREATE INDEX idx_cr_created ON public.commission_requests(created_at DESC);
CREATE UNIQUE INDEX uniq_pending_request_per_sale
  ON public.commission_requests(sale_id) WHERE status = 'pendente';

ALTER TABLE public.commission_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select cr own or staff" ON public.commission_requests
  FOR SELECT TO authenticated
  USING (corretor_user_id = auth.uid() OR is_financeiro(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "insert cr own pending" ON public.commission_requests
  FOR INSERT TO authenticated
  WITH CHECK (corretor_user_id = auth.uid() AND status = 'pendente');
CREATE POLICY "update cr by financeiro" ON public.commission_requests
  FOR UPDATE TO authenticated
  USING (is_financeiro(auth.uid())) WITH CHECK (is_financeiro(auth.uid()));
CREATE POLICY "delete cr by admin" ON public.commission_requests
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- nf_requests
CREATE TABLE public.nf_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  corretor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  solicitado_por uuid NOT NULL REFERENCES public.profiles(id),
  status nf_status NOT NULL DEFAULT 'solicitada',
  numero_nf text,
  arquivo_nf_url text,
  observacao_financeiro text,
  observacao_corretor text,
  observacao_recebimento text,
  emitida_at timestamptz,
  recebida_at timestamptz,
  cancelada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nf_corretor ON public.nf_requests(corretor_user_id);
CREATE INDEX idx_nf_status ON public.nf_requests(status);
CREATE INDEX idx_nf_sale ON public.nf_requests(sale_id);
CREATE UNIQUE INDEX uniq_active_nf_per_sale
  ON public.nf_requests(sale_id) WHERE status IN ('solicitada', 'emitida');

ALTER TABLE public.nf_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select nf own or staff" ON public.nf_requests
  FOR SELECT TO authenticated
  USING (corretor_user_id = auth.uid() OR is_financeiro(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "insert nf by financeiro" ON public.nf_requests
  FOR INSERT TO authenticated
  WITH CHECK (is_financeiro(auth.uid()) AND solicitado_por = auth.uid());
CREATE POLICY "update nf owner or financeiro" ON public.nf_requests
  FOR UPDATE TO authenticated
  USING (corretor_user_id = auth.uid() OR is_financeiro(auth.uid()))
  WITH CHECK (corretor_user_id = auth.uid() OR is_financeiro(auth.uid()));
CREATE POLICY "delete nf by admin" ON public.nf_requests
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- audit log
CREATE TABLE public.request_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.request_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON public.request_audit_log(created_at DESC);
ALTER TABLE public.request_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read audit by staff" ON public.request_audit_log
  FOR SELECT TO authenticated
  USING (is_financeiro(auth.uid()) OR is_admin(auth.uid()));

-- triggers updated_at
CREATE TRIGGER trg_broker_mapping_updated BEFORE UPDATE ON public.broker_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON public.commission_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_nf_updated BEFORE UPDATE ON public.nf_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- trigger auditoria
CREATE OR REPLACE FUNCTION public.audit_request_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.request_audit_log (entity_type, entity_id, action, actor_id, payload)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_audit_cr AFTER INSERT OR UPDATE OR DELETE ON public.commission_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();
CREATE TRIGGER trg_audit_nf AFTER INSERT OR UPDATE OR DELETE ON public.nf_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.commission_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nf_requests;
