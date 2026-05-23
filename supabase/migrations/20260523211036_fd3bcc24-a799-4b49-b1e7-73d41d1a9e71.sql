ALTER TABLE public.commission_requests
  ADD COLUMN IF NOT EXISTS comprovante_sinal_url text,
  ADD COLUMN IF NOT EXISTS comprovante_sinal_drive_id text;