import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { addAdvanceToSheet } from "./sheets-write.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}
async function getCorretorNome(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("broker_mapping").select("corretor_nome,ativo").eq("user_id", userId).maybeSingle();
  return data?.ativo ? data.corretor_nome : null;
}
async function assertFinanceiro(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

// ---------- CRIAR PEDIDO (corretor — admin pode agir em nome para testes) ----------
const CreateRequestSchema = z.object({
  sale_id: z.string().uuid(),
  tipo: z.enum(["adiantamento", "comissao_final"]),
  valor_sinal: z.number().min(0).max(10_000_000),
  bonus_corretor: z.number().min(0).max(10_000_000),
  valor_solicitado: z.number().min(0.01).max(10_000_000),
  observacao_corretor: z.string().trim().max(2000).optional(),
  act_as_corretor: z.string().trim().max(255).optional(),
});

export const createCommissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");

    let actorUserId = context.userId;
    let nome: string | null = null;

    if (isAdmin && data.act_as_corretor) {
      // Modo teste: admin age em nome de um corretor (mapeamento opcional)
      nome = data.act_as_corretor;
      const { data: map } = await supabaseAdmin
        .from("broker_mapping")
        .select("user_id")
        .eq("corretor_nome", data.act_as_corretor)
        .eq("ativo", true)
        .maybeSingle();
      actorUserId = map?.user_id ?? context.userId;
    } else {
      nome = await getCorretorNome(context.userId);
      if (!nome) throw new Error("Seu usuário não está vinculado a um corretor. Fale com o administrador.");
    }

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales").select("id,corretor").eq("id", data.sale_id).maybeSingle();
    if (saleErr) throw new Error(`Falha ao consultar venda: ${saleErr.message}`);
    if (!sale) throw new Error("Venda não encontrada no sistema.");
    if ((sale.corretor ?? "").trim().toLowerCase() !== nome.trim().toLowerCase())
      throw new Error(`Esta venda está vinculada a "${sale.corretor}", não a "${nome}".`);

    const { data: pend } = await supabaseAdmin
      .from("commission_requests").select("id").eq("sale_id", data.sale_id).eq("status", "pendente").maybeSingle();
    if (pend) throw new Error("Já existe um pedido pendente para esta venda.");

    const obs = isAdmin && data.act_as_corretor
      ? `[TESTE — admin agindo como ${data.act_as_corretor}] ${data.observacao_corretor ?? ""}`.trim()
      : data.observacao_corretor ?? null;

    const { error } = await supabaseAdmin.from("commission_requests").insert({
      corretor_user_id: actorUserId,
      sale_id: data.sale_id,
      tipo: data.tipo,
      valor_sinal: data.valor_sinal,
      bonus_corretor: data.bonus_corretor,
      valor_solicitado: data.valor_solicitado,
      observacao_corretor: obs,
      status: "pendente",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- EXCLUIR PEDIDO (admin) ----------
export const deleteCommissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin")) throw new Error("Apenas administradores podem excluir solicitações.");
    const { error } = await supabaseAdmin.from("commission_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- LISTAR PEDIDOS (financeiro) ----------
const ListRequestsSchema = z.object({
  status: z.enum(["pendente", "aprovado", "negado", "pago"]).optional(),
  corretor_user_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}).optional();

export const listAllRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListRequestsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    let q = supabaseAdmin.from("commission_requests").select("*").order("created_at", { ascending: false }).limit(2000);
    if (data?.status) q = q.eq("status", data.status);
    if (data?.corretor_user_id) q = q.eq("corretor_user_id", data.corretor_user_id);
    if (data?.from) q = q.gte("created_at", data.from);
    if (data?.to) q = q.lte("created_at", data.to);
    const { data: reqs, error } = await q;
    if (error) throw new Error(error.message);

    const saleIds = [...new Set((reqs ?? []).map((r) => r.sale_id))];
    const userIds = [...new Set((reqs ?? []).map((r) => r.corretor_user_id))];
    const safeIds = saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: sales }, { data: profs }, { data: paidReqs }] = await Promise.all([
      supabaseAdmin.from("sales").select("id,data,comprador,empreendimento,unidade,valor_venda,corretor,comissao_liq_corretor,status").in("id", safeIds),
      supabaseAdmin.from("profiles").select("id,display_name,email").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      // Todos pedidos PAGOS dessas vendas, para calcular adiantado/saldo + histórico.
      supabaseAdmin
        .from("commission_requests")
        .select("id,sale_id,tipo,valor_solicitado,status,paid_at,decided_at,created_at")
        .in("sale_id", safeIds)
        .eq("status", "pago"),
    ]);
    const sMap = new Map((sales ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const paidBySale = new Map<string, { adiantado: number; final: number; items: Array<{ id: string; tipo: string; valor: number; data: string | null }> }>();
    for (const pr of paidReqs ?? []) {
      const cur = paidBySale.get(pr.sale_id) ?? { adiantado: 0, final: 0, items: [] };
      const v = Number(pr.valor_solicitado) || 0;
      if (pr.tipo === "adiantamento") cur.adiantado += v;
      else if (pr.tipo === "comissao_final") cur.final += v;
      cur.items.push({
        id: pr.id,
        tipo: pr.tipo,
        valor: v,
        data: (pr.paid_at ?? pr.decided_at ?? pr.created_at) as string | null,
      });
      paidBySale.set(pr.sale_id, cur);
    }
    return (reqs ?? []).map((r) => {
      const sale = sMap.get(r.sale_id) ?? null;
      const comissaoLiq = Number(sale?.comissao_liq_corretor) || 0;
      const p = paidBySale.get(r.sale_id) ?? { adiantado: 0, final: 0, items: [] };
      const aReceber = Math.max(0, comissaoLiq - p.adiantado - p.final);
      return {
        ...r,
        sale,
        corretor_profile: pMap.get(r.corretor_user_id) ?? null,
        comissao_liq: comissaoLiq,
        adiantado_pago: p.adiantado,
        final_pago: p.final,
        a_receber: aReceber,
        historico: p.items.slice().sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")),
      };
    });

  });

// ---------- APROVAR / NEGAR (financeiro) ----------
const DecideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["aprovado", "negado"]),
  motivo: z.string().trim().max(2000).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

export const decideRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    if (data.decision === "negado" && (!data.motivo || data.motivo.trim().length === 0))
      throw new Error("Motivo é obrigatório ao negar.");

    // Update condicional para evitar race
    const { data: upd, error } = await supabaseAdmin
      .from("commission_requests")
      .update({
        status: data.decision,
        motivo_negacao: data.decision === "negado" ? data.motivo : null,
        observacao_financeiro: data.observacao ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pendente")
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd || upd.length === 0) throw new Error("Este pedido já foi decidido por outra pessoa.");

    // Ao aprovar adiantamento: abrir solicitação de NF automaticamente.
    // (A planilha só é atualizada quando o pagamento for confirmado — em markRequestPaid.)
    if (data.decision === "aprovado") {
      const { data: req } = await supabaseAdmin
        .from("commission_requests")
        .select("tipo, valor_solicitado, sale_id, corretor_user_id")
        .eq("id", data.id)
        .single();
      if (req?.tipo === "adiantamento" && req.sale_id) {
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("data, empreendimento, unidade, comprador, valor_venda, corretor")
          .eq("id", req.sale_id)
          .single();

        // Cria automaticamente solicitação de NF (se não houver ativa para a venda).
        try {
          const { data: active } = await supabaseAdmin
            .from("nf_requests")
            .select("id")
            .eq("sale_id", req.sale_id)
            .in("status", ["solicitada", "emitida"])
            .maybeSingle();
          if (!active) {
            // Resolver corretor_user_id: usa o do pedido; senão, mapeia pelo nome.
            let corretorUserId: string | null = req.corretor_user_id ?? null;
            if (!corretorUserId && sale?.corretor) {
              const { data: map } = await supabaseAdmin
                .from("broker_mapping")
                .select("user_id")
                .eq("corretor_nome", sale.corretor)
                .eq("ativo", true)
                .maybeSingle();
              corretorUserId = map?.user_id ?? null;
            }
            if (corretorUserId) {
              await supabaseAdmin.from("nf_requests").insert({
                sale_id: req.sale_id,
                corretor_user_id: corretorUserId,
                solicitado_por: context.userId,
                status: "solicitada",
                observacao_financeiro: "NF solicitada automaticamente após aprovação de adiantamento.",
              });
            }
          }
        } catch (e) {
          console.error("auto-create nf_request:", e);
        }
      }
    }
    return { ok: true };
  });

// ---------- MARCAR COMO PAGO ----------
const PaidSchema = z.object({ id: z.string().uuid(), observacao: z.string().trim().max(2000).optional() });

export const markRequestPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PaidSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Financeiro/admin OU o próprio corretor dono do pedido podem confirmar pagamento.
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");
    if (!isStaff) {
      const { data: own } = await supabaseAdmin
        .from("commission_requests")
        .select("corretor_user_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!own || own.corretor_user_id !== context.userId)
        throw new Error("Acesso negado.");
    }
    const patch: {
      status: "pago";
      paid_at: string;
      observacao_financeiro?: string;
      observacao_corretor?: string;
    } = {
      status: "pago",
      paid_at: new Date().toISOString(),
    };
    if (data.observacao) {
      if (isStaff) patch.observacao_financeiro = data.observacao;
      else patch.observacao_corretor = data.observacao;
    }
    // Transição atômica pendente|aprovado -> pago. Apenas o primeiro (financeiro OU corretor)
    // consegue marcar; o segundo recebe erro e nada é duplicado na planilha.
    const { data: upd, error } = await supabaseAdmin
      .from("commission_requests")
      .update(patch)
      .eq("id", data.id)
      .in("status", ["pendente", "aprovado"])
      .select("id, tipo, valor_solicitado, sale_id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("Pedido já foi marcado como pago.");

    // Após confirmação de pagamento de adiantamento, somar valor na planilha.
    let sheetWarning: string | undefined;
    const row = upd[0];
    if (row.tipo === "adiantamento" && row.sale_id) {
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("data, empreendimento, unidade, comprador, valor_venda, corretor")
        .eq("id", row.sale_id)
        .single();
      if (sale) {
        const res = await addAdvanceToSheet(sale, Number(row.valor_solicitado) || 0);
        if (!res.ok) {
          sheetWarning = res.error;
          console.error("addAdvanceToSheet:", res.error);
        }
      }
    }
    return { ok: true, sheetWarning };
  });
