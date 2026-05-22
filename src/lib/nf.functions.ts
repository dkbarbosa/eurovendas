import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadFileToDriveFolder, downloadDriveFile, deleteDriveFile, getOrCreateDriveFolder } from "./drive.server";

async function getRoles(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}
async function assertFinanceiro(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

// Normaliza para casamento tolerante: minúsculas, sem acentos, espaços colapsados
function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function firstToken(s: string): string {
  return normName(s).split(" ")[0] ?? "";
}

// Resolve corretor da planilha → user_id usando mapeamentos salvos.
// 1) match exato normalizado  2) fallback: primeiro nome único
function resolveBrokerUserId(
  corretor: string | null | undefined,
  maps: { user_id: string; corretor_nome: string }[],
): string | null {
  if (!corretor) return null;
  const target = normName(corretor);
  if (!target) return null;
  const exact = maps.find((m) => normName(m.corretor_nome) === target);
  if (exact) return exact.user_id;
  // contém / é contido
  const partial = maps.filter((m) => {
    const n = normName(m.corretor_nome);
    return n.includes(target) || target.includes(n);
  });
  if (partial.length === 1) return partial[0].user_id;
  // primeiro nome
  const first = firstToken(corretor);
  if (first) {
    const byFirst = maps.filter((m) => firstToken(m.corretor_nome) === first);
    if (byFirst.length === 1) return byFirst[0].user_id;
  }
  return null;
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
    const mapList = (maps ?? []) as { user_id: string; corretor_nome: string }[];
    return (sales ?? [])
      .filter((s) => !activeSaleIds.has(s.id))
      .map((s) => ({ ...s, mapped_user_id: resolveBrokerUserId(s.corretor, mapList) }));
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
    const { data: maps } = await supabaseAdmin
      .from("broker_mapping").select("user_id,corretor_nome").eq("ativo", true);
    const userId = resolveBrokerUserId(sale.corretor, (maps ?? []) as { user_id: string; corretor_nome: string }[]);
    if (!userId) throw new Error(`O corretor "${sale.corretor}" não está vinculado a nenhum usuário. Vincule em Admin → Usuários.`);
    // verifica NF ativa
    const { data: active } = await supabaseAdmin
      .from("nf_requests").select("id").eq("sale_id", data.sale_id).in("status", ["solicitada", "emitida"]).maybeSingle();
    if (active) throw new Error("Já existe uma NF ativa para esta venda.");

    const { error } = await supabaseAdmin.from("nf_requests").insert({
      sale_id: data.sale_id,
      corretor_user_id: userId,
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

// ---------- CORRETOR EMITE NF (faz upload para o Google Drive) ----------
const FileSchema = z.object({
  file_base64: z.string().min(10).max(20_000_000),
  file_name: z.string().trim().min(1).max(255),
  file_mime: z.string().trim().min(1).max(120),
});
const MarkEmittedSchema = z.object({
  id: z.string().uuid(),
  numero_nf: z.string().trim().min(1, "Número da NF é obrigatório").max(80),
  observacao: z.string().trim().max(2000).optional(),
  file_base64: z.string().min(10).max(20_000_000),
  file_name: z.string().trim().min(1).max(255),
  file_mime: z.string().trim().min(1).max(120),
  file2: FileSchema.optional(),
});

function sanitizeFolderName(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 200) || "Venda";
}

function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

export const markNFEmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkEmittedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");

    const ownerCheck = supabaseAdmin
      .from("nf_requests")
      .select("id,corretor_user_id,status,drive_file_id,sale_id")
      .eq("id", data.id)
      .maybeSingle();
    const { data: nfRow } = await ownerCheck;
    if (!nfRow) throw new Error("NF não encontrada.");
    if (nfRow.status !== "solicitada") throw new Error("NF não está mais aguardando emissão.");
    if (!isAdmin && nfRow.corretor_user_id !== context.userId) throw new Error("Acesso negado.");

    // Resolver/criar subpasta no Drive identificando a venda.
    let folderId: string | undefined;
    if (nfRow.sale_id) {
      const { data: sale } = await supabaseAdmin
        .from("sales").select("corretor,empreendimento,unidade")
        .eq("id", nfRow.sale_id).maybeSingle();
      const folderName = sanitizeFolderName([sale?.corretor, sale?.empreendimento, sale?.unidade]);
      try {
        folderId = await getOrCreateDriveFolder(folderName);
      } catch (e) {
        console.error("getOrCreateDriveFolder:", e);
      }
    }

    const buf1 = b64ToBytes(data.file_base64);
    const safeName1 = `${data.id}-${data.file_name.replace(/[^\w.\-]+/g, "_")}`;
    const uploaded = await uploadFileToDriveFolder({ buffer: buf1, filename: safeName1, mimeType: data.file_mime, folderId });

    let uploaded2: { id: string; webViewLink: string } | null = null;
    if (data.file2) {
      try {
        const buf2 = b64ToBytes(data.file2.file_base64);
        const safeName2 = `${data.id}-2-${data.file2.file_name.replace(/[^\w.\-]+/g, "_")}`;
        uploaded2 = await uploadFileToDriveFolder({ buffer: buf2, filename: safeName2, mimeType: data.file2.file_mime, folderId });
      } catch (e) {
        // rollback do primeiro upload se o segundo falhar
        try { await deleteDriveFile(uploaded.id); } catch { /* noop */ }
        throw e;
      }
    }

    const { data: upd, error } = await supabaseAdmin
      .from("nf_requests")
      .update({
        status: "recebida",
        numero_nf: data.numero_nf,
        observacao_corretor: data.observacao ?? null,
        arquivo_nf_url: uploaded.webViewLink,
        drive_file_id: uploaded.id,
        arquivo_nf_url_2: uploaded2?.webViewLink ?? null,
        drive_file_id_2: uploaded2?.id ?? null,
        emitida_at: new Date().toISOString(),
        recebida_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "solicitada")
      .select("id");
    if (error) {
      try { await deleteDriveFile(uploaded.id); } catch { /* noop */ }
      if (uploaded2) { try { await deleteDriveFile(uploaded2.id); } catch { /* noop */ } }
      throw new Error(error.message);
    }
    if (!upd?.length) {
      try { await deleteDriveFile(uploaded.id); } catch { /* noop */ }
      if (uploaded2) { try { await deleteDriveFile(uploaded2.id); } catch { /* noop */ } }
      throw new Error("NF não encontrada ou já foi emitida.");
    }
    return { ok: true };
  });

// ---------- BAIXAR NF DO DRIVE (financeiro/admin/dono) ----------
export const downloadNFFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");
    const { data: nf } = await supabaseAdmin
      .from("nf_requests")
      .select("drive_file_id,corretor_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!nf?.drive_file_id) throw new Error("Arquivo da NF não encontrado.");
    if (!isStaff && nf.corretor_user_id !== context.userId) throw new Error("Acesso negado.");

    const file = await downloadDriveFile(nf.drive_file_id);
    // Retorna base64 (a frontend converte para Blob e dispara o download)
    let bin = "";
    for (let i = 0; i < file.buffer.length; i++) bin += String.fromCharCode(file.buffer[i]);
    const base64 = btoa(bin);
    return { base64, contentType: file.contentType, filename: file.filename };
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
