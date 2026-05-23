-- Add new enum value to distrato_status
ALTER TYPE distrato_status ADD VALUE IF NOT EXISTS 'quitado_por_desconto';

-- Add tracking columns to distratos
ALTER TABLE public.distratos
  ADD COLUMN IF NOT EXISTS valor_devolvido numeric NOT NULL DEFAULT 0;

-- Add tracking column to commission_requests
ALTER TABLE public.commission_requests
  ADD COLUMN IF NOT EXISTS desconto_distrato numeric NOT NULL DEFAULT 0;

-- New table to track each discount application
CREATE TABLE IF NOT EXISTS public.distrato_descontos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  distrato_id uuid NOT NULL,
  commission_request_id uuid NOT NULL,
  corretor_user_id uuid,
  valor_desconto numeric NOT NULL CHECK (valor_desconto > 0),
  status text NOT NULL DEFAULT 'aplicado' CHECK (status IN ('aplicado','estornado')),
  observacao text,
  aplicado_por uuid,
  aplicado_at timestamp with time zone NOT NULL DEFAULT now(),
  estornado_por uuid,
  estornado_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dd_distrato ON public.distrato_descontos(distrato_id);
CREATE INDEX IF NOT EXISTS idx_dd_request ON public.distrato_descontos(commission_request_id);
CREATE INDEX IF NOT EXISTS idx_dd_corretor ON public.distrato_descontos(corretor_user_id);

ALTER TABLE public.distrato_descontos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd select own or staff"
  ON public.distrato_descontos FOR SELECT TO authenticated
  USING (corretor_user_id = auth.uid()
         OR app_private.is_financeiro(auth.uid())
         OR app_private.is_admin(auth.uid()));

CREATE POLICY "dd insert by financeiro"
  ON public.distrato_descontos FOR INSERT TO authenticated
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

CREATE POLICY "dd update by financeiro"
  ON public.distrato_descontos FOR UPDATE TO authenticated
  USING (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_financeiro(auth.uid()) OR app_private.is_admin(auth.uid()));

CREATE POLICY "dd delete by admin"
  ON public.distrato_descontos FOR DELETE TO authenticated
  USING (app_private.is_admin(auth.uid()));

CREATE TRIGGER update_dd_updated_at
  BEFORE UPDATE ON public.distrato_descontos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
