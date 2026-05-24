
ALTER TABLE public.nf_requests
  ADD COLUMN IF NOT EXISTS distrato_id uuid REFERENCES public.distratos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desconto_distrato numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_distrato text;

CREATE INDEX IF NOT EXISTS idx_nf_distrato ON public.nf_requests(distrato_id);
