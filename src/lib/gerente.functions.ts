import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type RequestRow = Database["public"]["Tables"]["commission_requests"]["Row"];
type DistratoRow = Database["public"]["Tables"]["distratos"]["Row"];
type DescontoRow = Database["public"]["Tables"]["distrato_descontos"]["Row"];


async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

async function getGerenteNome(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("broker_mapping")
    .select("gerente_nome,ativo")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.ativo && data.gerente_nome) return data.gerente_nome;

  // Fallback: resolve pelo display_name do profile contra distinct sales.gerente
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const displayName = (prof?.display_name ?? "").trim();
  if (!displayName) return null;
  const dnNorm = displayName.toLowerCase();
  const { data: hits } = await supabaseAdmin
    .from("sales")
    .select("gerente")
    .ilike("gerente", displayName)
    .not("gerente", "is", null)
    .limit(1);
  const hit = (hits ?? []).find((r) => (r.gerente ?? "").trim().toLowerCase() === dnNorm);
  if (!hit?.gerente) return null;
  await supabaseAdmin
    .from("broker_mapping")
    .upsert(
      { user_id: userId, gerente_nome: hit.gerente, ativo: true },
      { onConflict: "user_id" },
    );
  return hit.gerente;
}

// Lista nomes distintos de gerentes na planilha (para admin escolher quem inspecionar)
export const listDistinctGerentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin")) throw new Error("Acesso negado.");
    const { data } = await supabaseAdmin
      .from("sales")
      .select("gerente")
      .not("gerente", "is", null)
      .limit(10000);
    const set = new Set<string>();
    for (const r of data ?? []) if (r.gerente) set.add(r.gerente);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  });

const OverviewInput = z
  .object({
    gerente_nome: z.string().trim().min(1).max(200).optional(), // admin pode impersonar
  })
  .optional();

export const getGerenteOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OverviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");
    const isGer = roles.includes("gerente");
    if (!isAdmin && !isGer) throw new Error("Acesso negado.");

    let gerenteNome: string | null = null;
    let gerenteUserId: string | null = context.userId;

    if (isAdmin && data?.gerente_nome) {
      gerenteNome = data.gerente_nome;
      const { data: map } = await supabaseAdmin
        .from("broker_mapping")
        .select("user_id")
        .eq("gerente_nome", data.gerente_nome)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      gerenteUserId = map?.user_id ?? null;
    } else if (isGer) {
      gerenteNome = await getGerenteNome(context.userId);
      gerenteUserId = context.userId;
    }

    const empty = {
      gerenteNome: null as string | null,
      gerenteUserId: null as string | null,
      sales: [] as SaleRow[],
      requests: [] as RequestRow[],
      distratos: [] as DistratoRow[],
      descontos: [] as DescontoRow[],
    };

    if (!gerenteNome) return empty;

    const nomeNorm = gerenteNome.trim().toLowerCase();

    const { data: salesData, error: salesErr } = await supabaseAdmin
      .from("sales")
      .select("*")
      .ilike("gerente", gerenteNome)
      .order("data", { ascending: false })
      .limit(5000);
    if (salesErr) throw new Error(salesErr.message);
    const sales: SaleRow[] = (salesData ?? []).filter(
      (s) => (s.gerente ?? "").trim().toLowerCase() === nomeNorm,
    );

    let requests: RequestRow[] = [];
    if (gerenteUserId) {
      const { data: reqs } = await supabaseAdmin
        .from("commission_requests")
        .select("*")
        .eq("gerente_user_id", gerenteUserId)
        .eq("requester_role", "gerente")
        .order("created_at", { ascending: false })
        .limit(2000);
      requests = reqs ?? [];
    }

    const { data: dists } = await supabaseAdmin
      .from("distratos")
      .select("*")
      .ilike("gerente_nome", gerenteNome)
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(1000);
    const distratosBase: DistratoRow[] = (dists ?? []).filter(
      (d) => (d.gerente_nome ?? "").trim().toLowerCase() === nomeNorm,
    );

    // Anexa o valor que o gerente especificamente deve devolver (recipient.role='gerente').
    const distIds = distratosBase.map((d) => d.id);
    const recsByDist = new Map<string, { valor_devolver: number; valor_devolvido: number; status: string }>();
    if (distIds.length > 0) {
      const { data: recs } = await supabaseAdmin
        .from("distrato_recipients")
        .select("distrato_id,role,valor_devolver,valor_devolvido,status")
        .in("distrato_id", distIds)
        .eq("role", "gerente");
      for (const r of recs ?? []) {
        recsByDist.set(r.distrato_id, {
          valor_devolver: Number(r.valor_devolver) || 0,
          valor_devolvido: Number(r.valor_devolvido) || 0,
          status: r.status,
        });
      }
    }
    const distratos = distratosBase.map((d) => ({
      ...d,
      valor_devolver_role: recsByDist.get(d.id)?.valor_devolver ?? (Number(d.valor_devolver) || 0),
      valor_devolvido_role: recsByDist.get(d.id)?.valor_devolvido ?? 0,
      status_role: recsByDist.get(d.id)?.status ?? null,
    }));

    const reqIds = requests.map((r) => r.id);
    let descontos: DescontoRow[] = [];
    if (reqIds.length > 0) {
      const { data: dRows } = await supabaseAdmin
        .from("distrato_descontos")
        .select("*")
        .in("commission_request_id", reqIds);
      descontos = dRows ?? [];
    }

    return { gerenteNome, gerenteUserId, sales, requests, distratos, descontos };
  });



// --------- Criar pedido de comissão do gerente ----------
const CreateGerReqSchema = z.object({
  sale_id: z.string().uuid(),
  tipo: z.enum(["adiantamento", "comissao_final"]),
  valor_solicitado: z.number().min(0.01).max(10_000_000),
  bonus: z.number().min(0).max(10_000_000).default(0),
  observacao: z.string().trim().max(2000).optional(),
});

export const createGerenteCommissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateGerReqSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("gerente") && !roles.includes("admin"))
      throw new Error("Acesso negado.");

    const gerenteNome = await getGerenteNome(context.userId);
    if (!gerenteNome) throw new Error("Seu usuário não está vinculado a um gerente.");

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id,gerente,comissao_liq_gerente,valor_venda,valor_sinal_negocio,status")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (saleErr) throw new Error(saleErr.message);
    if (!sale) throw new Error("Venda não encontrada.");
    if ((sale.gerente ?? "").trim().toLowerCase() !== gerenteNome.trim().toLowerCase())
      throw new Error(`Você não é o gerente desta venda.`);

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

    if (statusUp === "RESERVADO")
      throw new Error("Venda RESERVADO não permite solicitação.");

    // Bloqueio rígido: adiantamento exige sinal de negócio registrado na planilha.
    if (data.tipo === "adiantamento" && sinal <= 0) {
      throw new Error("Sinal insuficiente — esta venda não possui sinal de negócio registrado na planilha.");
    }

    // Após adiantamento PAGO ao gerente, novo só libera quando status virar CAIXA.
    if (data.tipo === "adiantamento" && statusUp !== "CAIXA") {
      const { data: adiantPago } = await supabaseAdmin
        .from("commission_requests")
        .select("id")
        .eq("sale_id", data.sale_id)
        .eq("requester_role", "gerente")
        .eq("tipo", "adiantamento")
        .eq("status", "pago")
        .limit(1);
      if (adiantPago && adiantPago.length > 0)
        throw new Error("Adiantamento já pago. Novo pedido somente quando o status da venda mudar para CAIXA.");
    }

    if (statusUp !== "CAIXA") {
      if (data.tipo === "adiantamento") {
        if (sinal < 2999.99)
          throw new Error(`Adiantamento exige sinal ≥ ${fmt(2999.99)} (atual: ${fmt(sinal)}).`);
        // Gerente recebe R$ 500 a cada R$ 2.999,99 de sinal
        const maxAdiant = Math.floor(sinal / 2999.99) * 500;
        if (data.valor_solicitado > maxAdiant + 0.001)
          throw new Error(`Adiantamento máximo do gerente: ${fmt(maxAdiant)} (R$ 500 a cada R$ 2.999,99 de sinal).`);
      }
      if (data.tipo === "comissao_final") {
        const minSinal = valorVenda * 0.06;
        if (valorVenda > 0 && sinal < minSinal - 0.001)
          throw new Error(`Comissão final exige sinal ≥ 6% do VGV (mín. ${fmt(minSinal)}).`);
      }
    }

    // Saldo da comissão do gerente
    const comLiq = Number(sale.comissao_liq_gerente) || 0;
    const { data: paidRows } = await supabaseAdmin
      .from("commission_requests")
      .select("valor_solicitado")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "gerente")
      .eq("status", "pago");
    const jaPago = (paidRows ?? []).reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const maxReceber = Math.max(0, comLiq - jaPago);
    if (data.valor_solicitado > maxReceber + 0.001)
      throw new Error(`Valor (${fmt(data.valor_solicitado)}) excede saldo (${fmt(maxReceber)}).`);

    const { data: pend } = await supabaseAdmin
      .from("commission_requests")
      .select("id")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "gerente")
      .eq("status", "pendente")
      .maybeSingle();
    if (pend) throw new Error("Já existe pedido pendente do gerente para esta venda.");

    const { error } = await supabaseAdmin.from("commission_requests").insert({
      requester_role: "gerente",
      gerente_user_id: context.userId,
      corretor_user_id: null,
      sale_id: data.sale_id,
      tipo: data.tipo,
      valor_sinal: sinal,
      bonus_corretor: data.bonus,
      valor_solicitado: data.valor_solicitado,
      observacao_corretor: data.observacao ?? null,
      status: "pendente",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
