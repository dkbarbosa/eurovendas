-- 1) Remover funções de papel duplicadas no schema public (RLS usa app_private.*)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_financeiro(uuid);

-- 2) Remover índices duplicados
DROP INDEX IF EXISTS public.idx_cr_sale_id;             -- duplicata de idx_cr_sale
DROP INDEX IF EXISTS public.idx_nf_sale_id;             -- duplicata de idx_nf_sale
DROP INDEX IF EXISTS public.idx_nf_corretor;            -- coberto por idx_nf_corretor_status
DROP INDEX IF EXISTS public.idx_cr_corretor;            -- coberto por idx_cr_corretor_status
DROP INDEX IF EXISTS public.sales_corretor_idx;         -- duplicata de idx_sales_corretor
DROP INDEX IF EXISTS public.sales_data_idx;             -- duplicata de idx_sales_data
DROP INDEX IF EXISTS public.idx_broker_mapping_user_id; -- duplicata da PK
