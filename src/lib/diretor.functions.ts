import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

/**
 * Cálculo de comissão do Gerente Geral (Diretor):
 * - 0,4% sobre o valor da venda.
 * - Se a coluna COAPHAR estiver "Sim", desconta 4,5% do valor da venda ANTES de aplicar 0,4%.
 * - Se "Não" (ou vazio), aplica direto 0,4% sobre o valor da venda.
 * Aplica-se a todas as vendas (todos os times).
 */
export function calcComissaoDiretor(valor_venda: number | null | undefined, coaphar: string | null | undefined): number {
  const v = Number(valor_venda) || 0;
  const isCoaphar = String(coaphar ?? "").trim().toLowerCase().startsWith("s");
  const base = isCoaphar ? v * (1 - 0.045) : v;
  return base * 0.004;
}

export const getDiretorOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");
    const isDiretor = roles.includes("diretor");
    if (!isAdmin && !isDiretor) throw new Error("Acesso negado.");

    const [{ data: salesData, error: sErr }, { data: reqs }] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .select("*")
        .order("data", { ascending: false })
        .limit(10000),
      supabaseAdmin
        .from("commission_requests")
        .select("*")
        .eq("diretor_user_id", context.userId)
        .eq("requester_role", "diretor")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (sErr) throw new Error(sErr.message);

    const sales = (salesData ?? []).map((s) => ({
      ...s,
      comissao_diretor: calcComissaoDiretor(s.valor_venda as number | null, s.coaphar as string | null),
    }));

    return {
      diretorUserId: context.userId,
      sales,
      requests: reqs ?? [],
    };
  });

const CreateDiretorReqSchema = z.object({
  sale_id: z.string().uuid(),
  tipo: z.enum(["adiantamento", "comissao_final"]),
  valor_solicitado: z.number().min(0.01).max(10_000_000),
  observacao: z.string().trim().max(2000).optional(),
});

export const createDiretorCommissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateDiretorReqSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("diretor") && !roles.includes("admin"))
      throw new Error("Acesso negado.");

    const { data: sale, error: sErr } = await supabaseAdmin
      .from("sales")
      .select("id,valor_venda,valor_sinal_negocio,coaphar,status")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sale) throw new Error("Venda não encontrada.");

    // Bloqueia se distrato ativo
    const { data: distAtivo } = await supabaseAdmin
      .from("distratos")
      .select("id")
      .eq("sale_id", data.sale_id)
      .neq("status", "cancelado")
      .maybeSingle();
    if (distAtivo) throw new Error("Venda distratada — não permite pedido.");

    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const valorVenda = Number(sale.valor_venda) || 0;
    const sinal = Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
    const statusUp = (sale.status ?? "").trim().toUpperCase();
    const comTotal = calcComissaoDiretor(valorVenda, sale.coaphar as string | null);

    if (statusUp === "RESERVADO")
      throw new Error("Venda RESERVADO não permite solicitação.");

    if (statusUp !== "CAIXA") {
      if (data.tipo === "adiantamento") {
        if (sinal < 300 - 0.001)
          throw new Error(`Adiantamento exige sinal mínimo de ${fmt(300)} (atual: ${fmt(sinal)}).`);
      }
      if (data.tipo === "comissao_final") {
        const minSinal = valorVenda * 0.06;
        if (valorVenda > 0 && sinal < minSinal - 0.001)
          throw new Error(`Comissão final exige sinal ≥ 6% do VGV (mín. ${fmt(minSinal)}).`);
      }
    }

    // Saldo da comissão do diretor
    const { data: paidRows } = await supabaseAdmin
      .from("commission_requests")
      .select("valor_solicitado")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "diretor")
      .eq("diretor_user_id", context.userId)
      .eq("status", "pago");
    const jaPago = (paidRows ?? []).reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const maxReceber = Math.max(0, comTotal - jaPago);
    if (data.valor_solicitado > maxReceber + 0.001)
      throw new Error(`Valor (${fmt(data.valor_solicitado)}) excede saldo (${fmt(maxReceber)}).`);

    const { data: pend } = await supabaseAdmin
      .from("commission_requests")
      .select("id")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "diretor")
      .eq("diretor_user_id", context.userId)
      .eq("status", "pendente")
      .maybeSingle();
    if (pend) throw new Error("Já existe pedido pendente seu para esta venda.");

    const { error } = await supabaseAdmin.from("commission_requests").insert({
      requester_role: "diretor",
      diretor_user_id: context.userId,
      corretor_user_id: null,
      gerente_user_id: null,
      sale_id: data.sale_id,
      tipo: data.tipo,
      valor_sinal: sinal,
      bonus_corretor: 0,
      valor_solicitado: data.valor_solicitado,
      observacao_corretor: data.observacao ?? null,
      status: "pendente",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
