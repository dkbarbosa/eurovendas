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

    // Enriquece com sale + profile
    const saleIds = [...new Set((reqs ?? []).map((r) => r.sale_id))];
    const userIds = [...new Set((reqs ?? []).map((r) => r.corretor_user_id))];
    const [{ data: sales }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("sales").select("id,data,comprador,empreendimento,unidade,valor_venda,corretor,comissao_liq_corretor,status").in("id", saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("id,display_name,email").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const sMap = new Map((sales ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (reqs ?? []).map((r) => ({
      ...r,
      sale: sMap.get(r.sale_id) ?? null,
      corretor_profile: pMap.get(r.corretor_user_id) ?? null,
    }));
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
    return { ok: true };
  });

// ---------- MARCAR COMO PAGO ----------
const PaidSchema = z.object({ id: z.string().uuid(), observacao: z.string().trim().max(2000).optional() });

export const markRequestPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PaidSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: upd, error } = await supabaseAdmin
      .from("commission_requests")
      .update({
        status: "pago",
        paid_at: new Date().toISOString(),
        observacao_financeiro: data.observacao ?? undefined,
      })
      .eq("id", data.id)
      .eq("status", "aprovado")
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("Pedido precisa estar aprovado para marcar como pago.");
    return { ok: true };
  });
