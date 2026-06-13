CREATE TABLE public.daily_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  date_key date NOT NULL,
  frase text NOT NULL,
  acao_titulo text NOT NULL,
  acao_descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, date_key)
);

GRANT ALL ON public.daily_messages TO service_role;

ALTER TABLE public.daily_messages ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy pública: leitura/escrita só via serverFn admin.
CREATE POLICY "service role full access" ON public.daily_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);