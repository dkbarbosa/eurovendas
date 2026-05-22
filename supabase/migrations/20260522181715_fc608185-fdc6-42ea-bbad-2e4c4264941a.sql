ALTER TABLE public.nf_requests
  ADD COLUMN IF NOT EXISTS drive_file_id_2 text,
  ADD COLUMN IF NOT EXISTS arquivo_nf_url_2 text;