DROP INDEX IF EXISTS public.uniq_pending_request_per_sale;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_request_per_sale_role
ON public.commission_requests (sale_id, requester_role)
WHERE status = 'pendente'::request_status;