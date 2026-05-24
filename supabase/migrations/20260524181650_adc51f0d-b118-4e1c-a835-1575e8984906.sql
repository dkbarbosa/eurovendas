-- Endurecer função de auditoria: nunca derrubar a transação por falha no log
CREATE OR REPLACE FUNCTION public.audit_request_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.request_audit_log (entity_type, entity_id, action, actor_id, payload)
    VALUES (
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      auth.uid(),
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
    );
  EXCEPTION WHEN OTHERS THEN
    -- Falha no log não pode quebrar a operação principal
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Anexar triggers de auditoria (idempotente)
DROP TRIGGER IF EXISTS trg_audit_commission_requests ON public.commission_requests;
CREATE TRIGGER trg_audit_commission_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();

DROP TRIGGER IF EXISTS trg_audit_nf_requests ON public.nf_requests;
CREATE TRIGGER trg_audit_nf_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.nf_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();

DROP TRIGGER IF EXISTS trg_audit_distratos ON public.distratos;
CREATE TRIGGER trg_audit_distratos
  AFTER INSERT OR UPDATE OR DELETE ON public.distratos
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();

DROP TRIGGER IF EXISTS trg_audit_distrato_descontos ON public.distrato_descontos;
CREATE TRIGGER trg_audit_distrato_descontos
  AFTER INSERT OR UPDATE OR DELETE ON public.distrato_descontos
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_changes();

-- Performance do log: índice por entidade
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.request_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.request_audit_log (actor_id, created_at DESC);