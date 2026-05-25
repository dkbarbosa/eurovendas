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
    // Financeiro NÃO acessa comissões. Apenas admin pode atuar em nome de outro corretor.
    if (roles.includes("financeiro") && !roles.includes("admin") && !roles.includes("gerente") && !roles.includes("corretor")) {
      throw new Error("Acesso negado.");
    }
    const canActAs = roles.includes("admin");
    let nome: string | null = null;
    if (data?.corretorNome && canActAs) {
      nome = data.corretorNome;
    } else {
      nome = await getCorretorNome(context.userId);
    }
    if (!nome) return { corretorNome: null, sales: [], requests: [], nfs: [], descontos: [] };


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
    const reqsScoped = (reqs ?? []).filter(
      (r) => saleIds.has(r.sale_id) && ((r.requester_role ?? "corretor") === "corretor"),
    );
    const reqIds = reqsScoped.map((r) => r.id);

    // Descontos de distrato vinculados aos pedidos deste corretor — para exibir
    // ao corretor o detalhe completo (cliente/empreend./data/valor) de qual distrato
    // está abatendo cada pedido.
    let descontos: Array<{
      id: string;
      commission_request_id: string;
      distrato_id: string;
      valor_desconto: number;
      status: string;
      aplicado_at: string | null;
      observacao: string | null;
      distrato: {
        comprador: string | null;
        empreendimento: string | null;
        unidade: string | null;
        valor_devolver: number | null;
        valor_adiantamento: number | null;
        valor_comissao_final: number | null;
        data_venda: string | null;
      } | null;
    }> = [];
    if (reqIds.length > 0) {
      const { data: dRows } = await supabaseAdmin
        .from("distrato_descontos")
        .select("id,commission_request_id,distrato_id,valor_desconto,status,aplicado_at,observacao")
        .in("commission_request_id", reqIds)
        .eq("status", "aplicado");
      const distIds = [...new Set((dRows ?? []).map((d) => d.distrato_id))];
      const distMap = new Map<string, {
        comprador: string | null; empreendimento: string | null; unidade: string | null;
        valor_devolver: number | null; valor_adiantamento: number | null;
        valor_comissao_final: number | null; sale_id: string | null;
      }>();
      if (distIds.length > 0) {
        const { data: dists } = await supabaseAdmin
          .from("distratos")
          .select("id,comprador,empreendimento,unidade,valor_devolver,valor_adiantamento,valor_comissao_final,sale_id")
          .in("id", distIds);
        for (const d of dists ?? []) distMap.set(d.id, d);
      }
      const saleDateIds = [...new Set([...distMap.values()].map((d) => d.sale_id).filter((v): v is string => !!v))];
      const saleDates = new Map<string, string | null>();
      if (saleDateIds.length > 0) {
        const { data: srs } = await supabaseAdmin.from("sales").select("id,data").in("id", saleDateIds);
        for (const s of srs ?? []) saleDates.set(s.id, s.data ?? null);
      }
      descontos = (dRows ?? []).map((d) => {
        const dist = distMap.get(d.distrato_id);
        return {
          id: d.id,
          commission_request_id: d.commission_request_id,
          distrato_id: d.distrato_id,
          valor_desconto: Number(d.valor_desconto) || 0,
          status: d.status,
          aplicado_at: d.aplicado_at ?? null,
          observacao: d.observacao ?? null,
          distrato: dist ? {
            comprador: dist.comprador,
            empreendimento: dist.empreendimento,
            unidade: dist.unidade,
            valor_devolver: dist.valor_devolver,
            valor_adiantamento: dist.valor_adiantamento,
            valor_comissao_final: dist.valor_comissao_final,
            data_venda: dist.sale_id ? saleDates.get(dist.sale_id) ?? null : null,
          } : null,
        };
      });
    }

    return {
      corretorNome: nome,
      sales: sales ?? [],
      requests: reqsScoped,
      nfs: (nfs ?? []).filter((n) => saleIds.has(n.sale_id) && ((n.requester_role ?? "corretor") === "corretor")),
      descontos,
    };
  });

