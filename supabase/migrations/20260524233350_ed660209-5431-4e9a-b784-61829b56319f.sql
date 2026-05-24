DROP INDEX IF EXISTS public.uniq_active_nf_per_sale;
CREATE UNIQUE INDEX uniq_active_nf_per_sale_role
ON public.nf_requests (sale_id, requester_role)
WHERE status IN ('solicitada','emitida');