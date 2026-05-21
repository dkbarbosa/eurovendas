
-- Fix search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Revoke public exec on definer functions
REVOKE EXECUTE ON FUNCTION public.is_financeiro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_request_changes() FROM PUBLIC, anon, authenticated;
