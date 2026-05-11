
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'diretor', 'gerente', 'corretor');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger: cria profile + promove primeiro usuário a admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT count(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SALES ============
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date,
  empreendimento text,
  unidade text,
  comprador text,
  valor_venda numeric,
  corretor text,
  coaphar text,
  gerente text,
  pct_corretor numeric,
  comissao_bruta numeric,
  adiant_corretor numeric,
  bonus_corretor numeric,
  comissao_liq_corretor numeric,
  pct_gerente numeric,
  comissao_ger_bruta numeric,
  adiant_gerente numeric,
  bonus_gerente numeric,
  comissao_liq_gerente numeric,
  status text,
  mes_ano text,
  observacoes text,
  row_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_data_idx ON public.sales(data);
CREATE INDEX sales_corretor_idx ON public.sales(corretor);
CREATE INDEX sales_gerente_idx ON public.sales(gerente);
CREATE INDEX sales_empreend_idx ON public.sales(empreendimento);

-- ============ CONFIG ============
CREATE TABLE public.config_kv (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.config_kv ENABLE ROW LEVEL SECURITY;

INSERT INTO public.config_kv (key, value) VALUES
  ('sheets_spreadsheet_id', '""'::jsonb),
  ('sheets_range', '"Equipe Maicon!A:U"'::jsonb),
  ('meta_vgv', '7000000'::jsonb),
  ('meta_comissoes', '500000'::jsonb),
  ('pct_corretor_default', '0.016'::jsonb),
  ('pct_gerente_default', '0.007'::jsonb),
  ('pct_geral_default', '0.004'::jsonb);

-- ============ SYNC LOG ============
CREATE TABLE public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  rows_imported int DEFAULT 0,
  error text
);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============
-- profiles
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- sales
CREATE POLICY "auth read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write sales" ON public.sales FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- config_kv
CREATE POLICY "auth read config" ON public.config_kv FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write config" ON public.config_kv FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- sync_log
CREATE POLICY "auth read sync" ON public.sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write sync" ON public.sync_log FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
