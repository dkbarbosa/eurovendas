ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS valor_sinal_negocio numeric;

UPDATE public.config_kv
SET value = to_jsonb('Equipe Maicon!A:V'::text), updated_at = now()
WHERE key = 'sheets_range';

INSERT INTO public.config_kv (key, value, updated_at)
SELECT 'sheets_range', to_jsonb('Equipe Maicon!A:V'::text), now()
WHERE NOT EXISTS (SELECT 1 FROM public.config_kv WHERE key = 'sheets_range');