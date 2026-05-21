import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

async function getCorretorNome(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("broker_mapping")
    .select("corretor_nome,ativo")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.ativo ? data.corretor_nome : null;
}

// Lista nomes distintos de corretor encontrados na planilha
export const listDistinctCorretores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("sales")
      .select("corretor")
      .not("corretor", "is", null)
      .limit(10000);
    const set = new Set<string>();
    for (const r of data ?? []) if (r.corretor) set.add(r.corretor);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  });

// Lista vendas do corretor logado (ou de um corretor específico para staff)
const ListMySalesSchema = z.object({
  corretorNome: z.string().trim().min(1).max(200).optional(),
}).optional();

export const listMyBrokerSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListMySalesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("admin") || roles.includes("financeiro") || roles.includes("diretor");
    let nome: string | null = null;
    if (data?.corretorNome && isStaff) {
      nome = data.corretorNome;
    } else {
      nome = await getCorretorNome(context.userId);
    }
    if (!nome) return { corretorNome: null, sales: [], requests: [], nfs: [] };

    const [{ data: sales }, { data: reqs }, { data: nfs }] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .select("*")
        .eq("corretor", nome)
        .order("data", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("commission_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("nf_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const saleIds = new Set((sales ?? []).map((s) => s.id));
    return {
      corretorNome: nome,
      sales: sales ?? [],
      requests: (reqs ?? []).filter((r) => saleIds.has(r.sale_id)),
      nfs: (nfs ?? []).filter((n) => saleIds.has(n.sale_id)),
    };
  });
