import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}
async function assertFinanceiro(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

// ---------- CRIAR DISTRATO ----------
const CreateSchema = z.object({
  sale_id: z.string().uuid(),
  motivo: z.string().trim().min(3).max(2000),
  observacao_financeiro: z.string().trim().max(2000).optional(),
});

export const createDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);

    // Já existe distrato ativo nesta venda?
    const { data: existing } = await supabaseAdmin
      .from("distratos")
      .select("id,status")
      .eq("sale_id", data.sale_id)
      .neq("status", "cancelado")
      .maybeSingle();
    if (existing) throw new Error("Já existe um distrato registrado para esta venda.");

    // Carrega venda
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id,corretor,comprador,empreendimento,unidade")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (saleErr) throw new Error(saleErr.message);
    if (!sale) throw new Error("Venda não encontrada.");

    // Soma de pedidos PAGOS desta venda
    const { data: paidRows } = await supabaseAdmin
      .from("commission_requests")
      .select("id,tipo,valor_solicitado,corretor_user_id")
      .eq("sale_id", data.sale_id)
      .eq("status", "pago");
    const items = paidRows ?? [];
    const valorAdiant = items.filter((r) => r.tipo === "adiantamento").reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const valorFinal = items.filter((r) => r.tipo === "comissao_final").reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const total = valorAdiant + valorFinal;
    if (total <= 0) throw new Error("Nenhum valor pago para esta venda. Distrato desnecessário.");

    // Identifica corretor (do primeiro pedido pago)
    let corretorUserId: string | null = items.find((r) => r.corretor_user_id)?.corretor_user_id ?? null;
    if (!corretorUserId && sale.corretor) {
      const { data: map } = await supabaseAdmin
        .from("broker_mapping")
        .select("user_id")
        .eq("corretor_nome", sale.corretor)
        .eq("ativo", true)
        .maybeSingle();
      corretorUserId = map?.user_id ?? null;
    }

    // Insere o distrato
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("distratos")
      .insert({
        sale_id: sale.id,
        corretor_user_id: corretorUserId,
        corretor_nome: sale.corretor,
        comprador: sale.comprador,
        empreendimento: sale.empreendimento,
        unidade: sale.unidade,
        valor_devolver: total,
        valor_adiantamento: valorAdiant,
        valor_comissao_final: valorFinal,
        motivo: data.motivo,
        observacao_financeiro: data.observacao_financeiro ?? null,
        created_by: context.userId,
        status: "pendente_devolucao",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Marca pedidos pagos como 'distratado' para sair do "a receber"/saldos
    const ids = items.map((r) => r.id);
    if (ids.length > 0) {
      await supabaseAdmin
        .from("commission_requests")
        .update({ status: "distratado" })
        .in("id", ids);
    }

    return { ok: true, id: ins.id };
  });

// ---------- LISTAR DISTRATOS ----------
const ListSchema = z
  .object({
    status: z.enum(["pendente_devolucao", "devolvido", "cancelado"]).optional(),
    corretor_user_id: z.string().uuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const listDistratos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");

    let q = supabaseAdmin
      .from("distratos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!isStaff) q = q.eq("corretor_user_id", context.userId);
    if (data?.status) q = q.eq("status", data.status);
    if (isStaff && data?.corretor_user_id) q = q.eq("corretor_user_id", data.corretor_user_id);
    if (data?.from) q = q.gte("created_at", data.from);
    if (data?.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enriquecer com profile do corretor
    const userIds = [...new Set((rows ?? []).map((r) => r.corretor_user_id).filter((v): v is string => !!v))];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      corretor_profile: r.corretor_user_id ? pMap.get(r.corretor_user_id) ?? null : null,
    }));
  });

// ---------- MARCAR DEVOLVIDO ----------
const MarkSchema = z.object({
  id: z.string().uuid(),
  observacao_recebimento: z.string().trim().max(2000).optional(),
});
export const markDistratoDevolvido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { error } = await supabaseAdmin
      .from("distratos")
      .update({
        status: "devolvido",
        devolvido_at: new Date().toISOString(),
        devolvido_por: context.userId,
        observacao_recebimento: data.observacao_recebimento ?? null,
      })
      .eq("id", data.id)
      .eq("status", "pendente_devolucao");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- CANCELAR DISTRATO (admin) ----------
export const cancelDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin")) throw new Error("Apenas administradores podem cancelar.");
    // Reverte os pedidos: volta de 'distratado' para 'pago'
    const { data: d, error: e1 } = await supabaseAdmin
      .from("distratos")
      .select("sale_id")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!d) throw new Error("Distrato não encontrado.");
    await supabaseAdmin
      .from("commission_requests")
      .update({ status: "pago" })
      .eq("sale_id", d.sale_id)
      .eq("status", "distratado");
    const { error } = await supabaseAdmin
      .from("distratos")
      .update({ status: "cancelado" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
