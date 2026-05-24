import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadFileToDriveFolder, downloadDriveFile, deleteDriveFile, getCorretorDocFolder } from "./drive.server";

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
// Vendas elegíveis para solicitação de NF — uma por papel (corretor/gerente/diretor).
export const listEligibleSalesForNF = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceiro(context.userId);
    const [{ data: sales }, { data: nfs }] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .select("id,data,comprador,empreendimento,unidade,valor_venda,corretor,gerente,coaphar,comissao_liq_corretor,comissao_liq_gerente,status")
        .order("data", { ascending: false })
        .limit(2000),
      supabaseAdmin.from("nf_requests").select("sale_id,status,requester_role"),
    ]);
    const activeByRole = new Set<string>();
    for (const n of nfs ?? []) {
      if (n.status === "solicitada" || n.status === "emitida" || n.status === "recebida") {
        activeByRole.add(`${n.sale_id}::${n.requester_role ?? "corretor"}`);
      }
    }
    const { data: maps } = await supabaseAdmin.from("broker_mapping").select("user_id,corretor_nome").eq("ativo", true);
    const mapList = (maps ?? []) as { user_id: string; corretor_nome: string }[];
    return (sales ?? []).map((s) => ({
      ...s,
      mapped_user_id: resolveBrokerUserId(s.corretor, mapList),
      has_active_nf_corretor: activeByRole.has(`${s.id}::corretor`),
      has_active_nf_gerente: activeByRole.has(`${s.id}::gerente`),
      has_active_nf_diretor: activeByRole.has(`${s.id}::diretor`),
    }));
  });

// ---------- RESOLVERS PARA GERENTE/DIRETOR ----------
async function resolveGerenteUserIdForSale(saleGerenteNome: string | null | undefined): Promise<string | null> {
  if (!saleGerenteNome?.trim()) return null;
  const { data } = await supabaseAdmin
    .from("broker_mapping")
    .select("user_id,gerente_nome")
    .ilike("gerente_nome", saleGerenteNome.trim())
    .eq("ativo", true)
    .not("gerente_nome", "is", null)
    .limit(1);
  return data?.[0]?.user_id ?? null;
}
async function resolveDiretorUserId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "diretor")
    .limit(1);
  return data?.[0]?.user_id ?? null;
}

// ---------- SOLICITAR NF (financeiro) ----------
const RequestNFSchema = z.object({
  sale_id: z.string().uuid(),
  requester_role: z.enum(["corretor", "gerente", "diretor"]).default("corretor"),
  observacao: z.string().trim().max(2000).optional(),
  distrato_id: z.string().uuid().optional(),
  desconto_distrato: z.number().nonnegative().max(99999999).optional(),
  observacao_distrato: z.string().trim().max(2000).optional(),
});

export const requestNF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestNFSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("corretor,gerente")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (!sale) throw new Error("Venda não encontrada.");

    let corretorUserId: string | null = null;
    let gerenteUserId: string | null = null;
    let diretorUserId: string | null = null;

    if (data.requester_role === "corretor") {
      if (!sale.corretor) throw new Error("Venda sem corretor definido na planilha.");
      const { data: maps } = await supabaseAdmin
        .from("broker_mapping").select("user_id,corretor_nome").eq("ativo", true);
      corretorUserId = resolveBrokerUserId(sale.corretor, (maps ?? []) as { user_id: string; corretor_nome: string }[]);
      if (!corretorUserId) throw new Error(`O corretor "${sale.corretor}" não está vinculado a nenhum usuário. Vincule em Admin → Usuários.`);
    } else if (data.requester_role === "gerente") {
      if (!sale.gerente) throw new Error("Venda sem gerente definido na planilha.");
      gerenteUserId = await resolveGerenteUserIdForSale(sale.gerente);
      if (!gerenteUserId) throw new Error(`O gerente "${sale.gerente}" não está vinculado a nenhum usuário.`);
    } else {
      diretorUserId = await resolveDiretorUserId();
      if (!diretorUserId) throw new Error(`Nenhum usuário com perfil "Gestão" cadastrado.`);
    }

    // verifica NF ativa para esta venda + papel
    const { data: active } = await supabaseAdmin
      .from("nf_requests").select("id").eq("sale_id", data.sale_id)
      .eq("requester_role", data.requester_role)
      .in("status", ["solicitada", "emitida"]).maybeSingle();
    if (active) throw new Error("Já existe uma NF ativa para esta venda neste perfil.");

    // Valida desconto se vinculado a um distrato (apenas para corretor)
    let distratoId: string | null = null;
    let desconto = 0;
    if (data.requester_role === "corretor" && data.distrato_id && (data.desconto_distrato ?? 0) > 0) {
      const { data: dist } = await supabaseAdmin
        .from("distratos")
        .select("id,corretor_user_id,valor_devolver,valor_devolvido,status")
        .eq("id", data.distrato_id)
        .maybeSingle();
      if (!dist) throw new Error("Distrato não encontrado.");
      if (dist.status === "cancelado") throw new Error("Distrato cancelado.");
      if (dist.corretor_user_id && dist.corretor_user_id !== corretorUserId)
        throw new Error("Distrato pertence a outro corretor.");
      const saldo = Math.max(0, Number(dist.valor_devolver) - Number(dist.valor_devolvido));
      if ((data.desconto_distrato ?? 0) > saldo + 0.001)
        throw new Error(`Desconto excede saldo do distrato (saldo: ${saldo.toFixed(2)}).`);
      distratoId = data.distrato_id;
      desconto = data.desconto_distrato ?? 0;

      const novoDevolvido = Number(dist.valor_devolvido) + desconto;
      const quitado = novoDevolvido >= Number(dist.valor_devolver) - 0.001;
      await supabaseAdmin
        .from("distratos")
        .update({
          valor_devolvido: novoDevolvido,
          status: quitado ? "quitado_por_desconto" : "pendente_devolucao",
        })
        .eq("id", distratoId);
    }

    const { error } = await supabaseAdmin.from("nf_requests").insert({
      sale_id: data.sale_id,
      requester_role: data.requester_role,
      corretor_user_id: corretorUserId,
      gerente_user_id: gerenteUserId,
      diretor_user_id: diretorUserId,
      solicitado_por: context.userId,
      status: "solicitada",
      observacao_financeiro: data.observacao ?? null,
      distrato_id: distratoId,
      desconto_distrato: desconto,
      observacao_distrato: data.observacao_distrato ?? null,
    });
    if (error) {
      if (distratoId && desconto > 0) {
        const { data: dist } = await supabaseAdmin
          .from("distratos").select("valor_devolvido,valor_devolver,status")
          .eq("id", distratoId).maybeSingle();
        if (dist) {
          await supabaseAdmin.from("distratos").update({
            valor_devolvido: Math.max(0, Number(dist.valor_devolvido) - desconto),
            status: "pendente_devolucao",
          }).eq("id", distratoId);
        }
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- LISTAR PENDÊNCIAS DE DISTRATO PARA UMA VENDA (financeiro) ----------
// Recebe o sale_id e retorna as pendências do corretor mapeado para essa venda,
// já incluindo o histórico de descontos aplicados em cada distrato.
export const listDistratosForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sale_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: sale } = await supabaseAdmin
      .from("sales").select("corretor").eq("id", data.sale_id).maybeSingle();
    if (!sale?.corretor) return { corretor_user_id: null as string | null, distratos: [], descontos: [], nfs_desconto: [] };
    const { data: maps } = await supabaseAdmin
      .from("broker_mapping").select("user_id,corretor_nome").eq("ativo", true);
    const userId = resolveBrokerUserId(sale.corretor, (maps ?? []) as { user_id: string; corretor_nome: string }[]);
    if (!userId) return { corretor_user_id: null, distratos: [], descontos: [], nfs_desconto: [] };

    const { data: dists } = await supabaseAdmin
      .from("distratos")
      .select("*")
      .eq("corretor_user_id", userId)
      .neq("status", "cancelado")
      .order("created_at", { ascending: false });

    const distIds = (dists ?? []).map((d) => d.id);
    const [{ data: descs }, { data: nfsDesc }] = await Promise.all([
      distIds.length
        ? supabaseAdmin.from("distrato_descontos").select("*").in("distrato_id", distIds).order("aplicado_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
      distIds.length
        ? supabaseAdmin
            .from("nf_requests")
            .select("id,sale_id,distrato_id,desconto_distrato,observacao_distrato,status,created_at")
            .in("distrato_id", distIds)
            .gt("desconto_distrato", 0)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    return {
      corretor_user_id: userId,
      distratos: (dists ?? []).map((d) => ({
        ...d,
        saldo_restante: Math.max(0, Number(d.valor_devolver) - Number(d.valor_devolvido)),
      })),
      descontos: descs ?? [],
      nfs_desconto: nfsDesc ?? [],
    };
  });


// ---------- LISTAR NF (financeiro) ----------
export const listAllNFs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceiro(context.userId);
    const { data: nfs } = await supabaseAdmin
      .from("nf_requests").select("*").order("created_at", { ascending: false }).limit(2000);
    const saleIds = [...new Set((nfs ?? []).map((n) => n.sale_id).filter((v): v is string => !!v))];
    const userIds = [...new Set((nfs ?? []).map((n) => n.corretor_user_id).filter((v): v is string => !!v))];
    const [{ data: sales }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("sales").select("id,data,comprador,empreendimento,unidade,valor_venda,corretor").in("id", saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("id,display_name,email").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const sMap = new Map((sales ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (nfs ?? []).map((n) => ({
      ...n,
      sale: sMap.get(n.sale_id) ?? null,
      corretor_profile: n.corretor_user_id ? pMap.get(n.corretor_user_id) ?? null : null,
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
  valor_nf: z.number().positive("Valor da NF deve ser maior que zero"),
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

    // Resolver/criar subpasta no Drive: {Corretor}/NF/{Empreendimento}/{Cliente}
    let folderId: string | undefined;
    if (nfRow.sale_id) {
      const { data: sale } = await supabaseAdmin
        .from("sales").select("corretor,empreendimento,unidade,comprador")
        .eq("id", nfRow.sale_id).maybeSingle();
      if (sale?.corretor) {
        try {
          folderId = await getCorretorDocFolder({
            corretor: sale.corretor,
            tipo: "NF",
            empreendimento: sale.empreendimento,
            cliente: sale.comprador ?? sale.unidade,
          });
        } catch (e) {
          console.error("getCorretorDocFolder:", e);
        }
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
        valor_nf: data.valor_nf,
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
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), which: z.enum(["1", "2"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");
    const { data: nf } = await supabaseAdmin
      .from("nf_requests")
      .select("drive_file_id,drive_file_id_2,corretor_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!nf) throw new Error("NF não encontrada.");
    if (!isStaff && nf.corretor_user_id !== context.userId) throw new Error("Acesso negado.");
    const fileId = data.which === "2" ? nf.drive_file_id_2 : nf.drive_file_id;
    if (!fileId) throw new Error("Arquivo não encontrado.");

    const file = await downloadDriveFile(fileId);
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
    // Reverter desconto do distrato (se houver)
    const { data: nf } = await supabaseAdmin
      .from("nf_requests").select("distrato_id,desconto_distrato,status")
      .eq("id", data.id).maybeSingle();
    if (nf && nf.distrato_id && Number(nf.desconto_distrato) > 0 && nf.status !== "cancelada") {
      const { data: dist } = await supabaseAdmin
        .from("distratos").select("valor_devolvido,valor_devolver,status")
        .eq("id", nf.distrato_id).maybeSingle();
      if (dist) {
        await supabaseAdmin.from("distratos").update({
          valor_devolvido: Math.max(0, Number(dist.valor_devolvido) - Number(nf.desconto_distrato)),
          status: "pendente_devolucao",
        }).eq("id", nf.distrato_id);
      }
    }
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
    // Reverter desconto do distrato se ainda não cancelado
    const { data: nf } = await supabaseAdmin
      .from("nf_requests").select("distrato_id,desconto_distrato,status")
      .eq("id", data.id).maybeSingle();
    if (nf && nf.distrato_id && Number(nf.desconto_distrato) > 0 && nf.status !== "cancelada") {
      const { data: dist } = await supabaseAdmin
        .from("distratos").select("valor_devolvido")
        .eq("id", nf.distrato_id).maybeSingle();
      if (dist) {
        await supabaseAdmin.from("distratos").update({
          valor_devolvido: Math.max(0, Number(dist.valor_devolvido) - Number(nf.desconto_distrato)),
          status: "pendente_devolucao",
        }).eq("id", nf.distrato_id);
      }
    }
    const { error } = await supabaseAdmin.from("nf_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- MARCAR NF COMO PAGA (corretor ou financeiro — quem clicar primeiro finaliza) ----------
export const markNFPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");
    const { data: nf } = await supabaseAdmin
      .from("nf_requests")
      .select("id,status,corretor_user_id,sale_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!nf) throw new Error("NF não encontrada.");
    if (!isStaff && nf.corretor_user_id !== context.userId) throw new Error("Acesso negado.");
    if (nf.status !== "paga" && nf.status !== "recebida")
      throw new Error("NF precisa estar recebida para ser marcada como paga.");

    if (nf.status === "recebida") {
      const { error } = await supabaseAdmin
        .from("nf_requests")
        .update({ status: "paga", paga_at: new Date().toISOString(), paga_por: context.userId })
        .eq("id", data.id)
        .eq("status", "recebida");
      if (error) throw new Error(error.message);
    }

    // Cascata: marcar pedidos vinculados (aprovado/pendente) como pagos para sinalizar
    // no painel do corretor que o processo foi finalizado.
    if (nf.sale_id) {
      try {
        await supabaseAdmin
          .from("commission_requests")
          .update({ status: "pago", paid_at: new Date().toISOString() })
          .eq("sale_id", nf.sale_id)
          .in("status", ["aprovado", "pendente"]);
      } catch (e) {
        console.error("cascade markRequestPaid from NF:", e);
      }
    }
    return { ok: true };
  });
