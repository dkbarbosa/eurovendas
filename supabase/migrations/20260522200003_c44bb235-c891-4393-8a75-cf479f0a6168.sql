-- 1) Tornar colunas anuláveis e trocar FKs para ON DELETE SET NULL
ALTER TABLE public.commission_requests ALTER COLUMN corretor_user_id DROP NOT NULL;
ALTER TABLE public.nf_requests ALTER COLUMN corretor_user_id DROP NOT NULL;
ALTER TABLE public.nf_requests ALTER COLUMN solicitado_por DROP NOT NULL;

ALTER TABLE public.commission_requests DROP CONSTRAINT IF EXISTS commission_requests_corretor_user_id_fkey;
ALTER TABLE public.commission_requests
  ADD CONSTRAINT commission_requests_corretor_user_id_fkey
  FOREIGN KEY (corretor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.commission_requests DROP CONSTRAINT IF EXISTS commission_requests_decided_by_fkey;
ALTER TABLE public.commission_requests
  ADD CONSTRAINT commission_requests_decided_by_fkey
  FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.nf_requests DROP CONSTRAINT IF EXISTS nf_requests_corretor_user_id_fkey;
ALTER TABLE public.nf_requests
  ADD CONSTRAINT nf_requests_corretor_user_id_fkey
  FOREIGN KEY (corretor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.nf_requests DROP CONSTRAINT IF EXISTS nf_requests_solicitado_por_fkey;
ALTER TABLE public.nf_requests
  ADD CONSTRAINT nf_requests_solicitado_por_fkey
  FOREIGN KEY (solicitado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) Índices de performance
CREATE INDEX IF NOT EXISTS idx_cr_sale_id ON public.commission_requests(sale_id);
CREATE INDEX IF NOT EXISTS idx_cr_corretor_status ON public.commission_requests(corretor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_cr_status_created ON public.commission_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nf_sale_id ON public.nf_requests(sale_id);
CREATE INDEX IF NOT EXISTS idx_nf_corretor_status ON public.nf_requests(corretor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_nf_status_created ON public.nf_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_row_hash ON public.sales(row_hash);
CREATE INDEX IF NOT EXISTS idx_sales_corretor ON public.sales(corretor);
CREATE INDEX IF NOT EXISTS idx_sales_data ON public.sales(data DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_mapping_user_id ON public.broker_mapping(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON public.sync_log(started_at DESC);