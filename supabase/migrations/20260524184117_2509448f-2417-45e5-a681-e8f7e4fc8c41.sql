ALTER TABLE public.broker_mapping
  ADD COLUMN IF NOT EXISTS team_gerente_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_broker_mapping_team_gerente
  ON public.broker_mapping(team_gerente_user_id);