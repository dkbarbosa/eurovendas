import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadFileToDriveFolder, downloadDriveFile, deleteDriveFile } from "./drive.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}
async function assertFinanceiro(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

// ---------- VENDAS ELEGÍVEIS PARA NF (financeiro) ----------
export const listEligibleSalesForNF = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceiro(context.userId);
    const [{ data: sales }, { data: nfs }] = await Promise.all([
      supabaseAdmin.from("sales").select("id,data,comprador,empreendimento,unidade,valor_venda,corretor,comissao_liq_corretor,status").order("data", { ascending: false }).limit(2000),
      supabaseAdmin.from("nf_requests").select("sale_id,status"),
    ]);
    const activeSaleIds = new Set(
      (nfs ?? []).filter((n) => n.status === "solicitada" || n.status === "emitida" || n.status === "recebida").map((n) => n.sale_id),
    );
    const { data: maps } = await supabaseAdmin.from("broker_mapping").select("user_id,corretor_nome").eq("ativo", true);
    const corretorToUser = new Map((maps ?? []).map((m) => [m.corretor_nome, m.user_id]));
    return (sales ?? [])
      .filter((s) => !activeSaleIds.has(s.id))
      .map((s) => ({ ...s, mapped_user_id: s.corretor ? corretorToUser.get(s.corretor) ?? null : null }));
  });

// ---------- SOLICITAR NF (financeiro) ----------
const RequestNFSchema = z.object({
  sale_id: z.string().uuid(),
  observacao: z.string().trim().max(2000).optional(),
});

export const requestNF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestNFSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: sale } = await supabaseAdmin.from("sales").select("corretor").eq("id", data.sale_id).maybeSingle();
    if (!sale) throw new Error("Venda não encontrada.");
    if (!sale.corretor) throw new Error("Venda sem corretor definido na planilha.");
    const { data: map } = await supabaseAdmin
      .from("broker_mapping").select("user_id").eq("corretor_nome", sale.corretor).eq("ativo", true).maybeSingle();
    if (!map) throw new Error(`O corretor "${sale.corretor}" não está vinculado a nenhum usuário. Vincule em Admin → Usuários.`);
    // verifica NF ativa
    const { data: active } = await supabaseAdmin
      .from("nf_requests").select("id").eq("sale_id", data.sale_id).in("status", ["solicitada", "emitida"]).maybeSingle();
    if (active) throw new Error("Já existe uma NF ativa para esta venda.");

    const { error } = await supabaseAdmin.from("nf_requests").insert({
      sale_id: data.sale_id,
      corretor_user_id: map.user_id,
      solicitado_por: context.userId,
      status: "solicitada",
      observacao_financeiro: data.observacao ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- LISTAR NF (financeiro) ----------
export const listAllNFs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceiro(context.userId);
    const { data: nfs } = await supabaseAdmin
      .from("nf_requests").select("*").order("created_at", { ascending: false }).limit(2000);
    const saleIds = [...new Set((nfs ?? []).map((n) => n.sale_id))];
    const userIds = [...new Set((nfs ?? []).map((n) => n.corretor_user_id))];
    const [{ data: sales }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("sales").select("id,data,comprador,empreendimento,unidade,valor_venda,corretor").in("id", saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("id,display_name,email").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const sMap = new Map((sales ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (nfs ?? []).map((n) => ({
      ...n,
      sale: sMap.get(n.sale_id) ?? null,
      corretor_profile: pMap.get(n.corretor_user_id) ?? null,
    }));
  });

// ---------- CORRETOR EMITE NF ----------
const MarkEmittedSchema = z.object({
  id: z.string().uuid(),
  numero_nf: z.string().trim().min(1, "Número da NF é obrigatório").max(80),
  observacao: z.string().trim().max(2000).optional(),
  arquivo_url: z.string().url().max(500).optional(),
});

export const markNFEmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkEmittedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");

    let q = supabaseAdmin
      .from("nf_requests")
      .update({
        status: "emitida",
        numero_nf: data.numero_nf,
        observacao_corretor: data.observacao ?? null,
        arquivo_nf_url: data.arquivo_url ?? null,
        emitida_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "solicitada");
    if (!isAdmin) q = q.eq("corretor_user_id", context.userId);

    const { data: upd, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("NF não encontrada ou já foi emitida.");
    return { ok: true };
  });

// ---------- FINANCEIRO CONFIRMA RECEBIMENTO ----------
const ConfirmReceivedSchema = z.object({
  id: z.string().uuid(),
  observacao: z.string().trim().max(2000).optional(),
});

export const confirmNFReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfirmReceivedSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: upd, error } = await supabaseAdmin
      .from("nf_requests")
      .update({
        status: "recebida",
        observacao_recebimento: data.observacao ?? null,
        recebida_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "emitida")
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("NF precisa estar emitida para confirmar recebimento.");
    return { ok: true };
  });

// ---------- CANCELAR NF ----------
const CancelSchema = z.object({ id: z.string().uuid(), motivo: z.string().trim().min(1).max(2000) });

export const cancelNF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { error } = await supabaseAdmin
      .from("nf_requests")
      .update({
        status: "cancelada",
        observacao_financeiro: data.motivo,
        cancelada_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .in("status", ["solicitada", "emitida"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- EXCLUIR NF (admin) ----------
export const deleteNFRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin")) throw new Error("Apenas administradores podem excluir.");
    const { error } = await supabaseAdmin.from("nf_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
