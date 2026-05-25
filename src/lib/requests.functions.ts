import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { addAdvanceToSheet, addManagerAdvanceToSheet } from "./sheets-write.server";
import { uploadFileToDriveFolder, getOrCreateDriveFolder } from "./drive.server";

function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}
function sanitizeFolderName(parts: Array<string | null | undefined>): string {
  return (
    parts
      .map((p) => (p ?? "").toString().trim())
      .filter(Boolean)
      .join(" - ")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 200) || "Venda"
  );
}

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
async function assertFinanceiro(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

function calcDiretorComissao(
  valorVenda: number | null | undefined,
  coaphar: string | null | undefined,
) {
  const v = Number(valorVenda) || 0;
  const isCoaphar = String(coaphar ?? "")
    .trim()
    .toLowerCase()
    .startsWith("s");
  return (isCoaphar ? v * (1 - 0.045) : v) * 0.004;
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
  comprovante_sinal: z
    .object({
      file_base64: z.string().min(10).max(20_000_000),
      file_name: z.string().trim().min(1).max(255),
      file_mime: z.string().trim().min(1).max(120),
    })
    .optional(),
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
      if (!nome)
        throw new Error("Seu usuário não está vinculado a um corretor. Fale com o administrador.");
    }

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id,corretor,comissao_liq_corretor,valor_venda,valor_sinal_negocio,status")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (saleErr) throw new Error(`Falha ao consultar venda: ${saleErr.message}`);
    if (!sale) throw new Error("Venda não encontrada no sistema.");

    // Bloqueia novos pedidos se houver distrato ativo
    const { data: distratoAtivo } = await supabaseAdmin
      .from("distratos")
      .select("id")
      .eq("sale_id", data.sale_id)
      .neq("status", "cancelado")
      .maybeSingle();
    if (distratoAtivo)
      throw new Error("Esta venda foi distratada — não é possível solicitar novos valores.");

    if ((sale.corretor ?? "").trim().toLowerCase() !== nome.trim().toLowerCase())
      throw new Error(`Esta venda está vinculada a "${sale.corretor}", não a "${nome}".`);

    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const valorVenda = Number(sale.valor_venda) || 0;
    // Sinal autoritativo vem da planilha quando preenchido; cai para o informado no pedido apenas se ausente.
    const sinalSheet =
      Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
    const sinal = sinalSheet > 0 ? sinalSheet : Number(data.valor_sinal) || 0;
    const statusUp = (sale.status ?? "").trim().toUpperCase();

    // Regras por status:
    //  - RESERVADO: bloqueia qualquer pedido.
    //  - CAIXA: libera o pedido sem exigir sinal (comissão integral).
    //  - ASSINADO (e demais): aplica regras de sinal (adiantamento e comissão final).
    if (statusUp === "RESERVADO") {
      throw new Error("Venda com status RESERVADO não permite solicitação. Aguarde a assinatura.");
    }

    // Bloqueio rígido: adiantamento exige sinal de negócio registrado na planilha.
    if (data.tipo === "adiantamento" && sinalSheet <= 0) {
      throw new Error("Sinal insuficiente — esta venda não possui sinal de negócio registrado na planilha.");
    }

    // Após adiantamento PAGO, novo adiantamento só libera quando o status virar CAIXA.
    if (data.tipo === "adiantamento" && statusUp !== "CAIXA") {
      const { data: adiantPago } = await supabaseAdmin
        .from("commission_requests")
        .select("id")
        .eq("sale_id", data.sale_id)
        .eq("requester_role", "corretor")
        .eq("tipo", "adiantamento")
        .eq("status", "pago")
        .limit(1);
      if (adiantPago && adiantPago.length > 0) {
        throw new Error("Adiantamento já pago. Novo pedido somente quando o status da venda mudar para CAIXA.");
      }
    }

    if (statusUp !== "CAIXA") {
      if (data.tipo === "adiantamento") {
        if (sinal < 2999.99) {
          throw new Error(
            `Adiantamento liberado apenas com sinal a partir de ${fmt(2999.99)} (sinal informado: ${fmt(sinal)}).`,
          );
        }
        const maxAdiant = Math.floor(sinal / 2999.99) * 1000;
        if (data.valor_solicitado > maxAdiant + 0.001) {
          throw new Error(
            `Valor de adiantamento máximo permitido: ${fmt(maxAdiant)} (regra: R$1.000 a cada R$2.999,99 de sinal).`,
          );
        }
      }
      if (data.tipo === "comissao_final") {
        const minSinal = valorVenda * 0.06;
        if (valorVenda > 0 && sinal < minSinal - 0.001) {
          throw new Error(
            `Comissão final liberada apenas com sinal ≥ 6% do valor da venda (mín. ${fmt(minSinal)}; informado: ${fmt(sinal)}).`,
          );
        }
      }
    }

    // Trava de saldo: valor solicitado não pode passar do que ainda há a receber.
    const comLiq = Number(sale.comissao_liq_corretor) || 0;
    const { data: paidRows } = await supabaseAdmin
      .from("commission_requests")
      .select("valor_solicitado")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "corretor")
      .eq("status", "pago");
    const jaPago = (paidRows ?? []).reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const maxReceber = Math.max(0, comLiq - jaPago);
    if (data.valor_solicitado > maxReceber + 0.001) {
      throw new Error(
        `Valor solicitado (${fmt(data.valor_solicitado)}) excede o saldo a receber (${fmt(maxReceber)}).`,
      );
    }

    const { data: pend } = await supabaseAdmin
      .from("commission_requests")
      .select("id")
      .eq("sale_id", data.sale_id)
      .eq("requester_role", "corretor")
      .eq("status", "pendente")
      .maybeSingle();
    if (pend) throw new Error("Já existe um pedido pendente do corretor para esta venda.");

    const obs =
      isAdmin && data.act_as_corretor
        ? `[TESTE — admin agindo como ${data.act_as_corretor}] ${data.observacao_corretor ?? ""}`.trim()
        : (data.observacao_corretor ?? null);

    // Comprovante de sinal: obrigatório quando a planilha não traz o valor preenchido
    // (e não é venda em CAIXA — que dispensa exigência de sinal).
    const sinalSheetMissing = sinalSheet <= 0 && statusUp !== "CAIXA";
    if (sinalSheetMissing && !data.comprovante_sinal) {
      throw new Error(
        "Sinal não consta na planilha. Anexe o comprovante de sinal para enviar a solicitação.",
      );
    }

    let comprovanteUrl: string | null = null;
    let comprovanteDriveId: string | null = null;
    if (data.comprovante_sinal) {
      try {
        const folderName = sanitizeFolderName([sale.corretor, "Comprovantes Sinal"]);
        const folderId = await getOrCreateDriveFolder(folderName);
        const buf = b64ToBytes(data.comprovante_sinal.file_base64);
        const safeName = `${data.sale_id}-sinal-${Date.now()}-${data.comprovante_sinal.file_name.replace(/[^\w.-]+/g, "_")}`;
        const up = await uploadFileToDriveFolder({
          buffer: buf,
          filename: safeName,
          mimeType: data.comprovante_sinal.file_mime,
          folderId,
        });
        comprovanteUrl = up.webViewLink;
        comprovanteDriveId = up.id;
      } catch (e) {
        throw new Error(`Falha ao enviar comprovante de sinal: ${(e as Error).message}`);
      }
    }

    const { error } = await supabaseAdmin.from("commission_requests").insert({
      corretor_user_id: actorUserId,
      sale_id: data.sale_id,
      tipo: data.tipo,
      valor_sinal: sinal,
      bonus_corretor: data.bonus_corretor,
      valor_solicitado: data.valor_solicitado,
      observacao_corretor: obs,
      comprovante_sinal_url: comprovanteUrl,
      comprovante_sinal_drive_id: comprovanteDriveId,
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
    if (!roles.includes("admin"))
      throw new Error("Apenas administradores podem excluir solicitações.");
    const { error } = await supabaseAdmin.from("commission_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- LISTAR PEDIDOS (financeiro) ----------
const ListRequestsSchema = z
  .object({
    status: z.enum(["pendente", "aprovado", "negado", "pago"]).optional(),
    corretor_user_id: z.string().uuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const listAllRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListRequestsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    let q = supabaseAdmin
      .from("commission_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data?.status) q = q.eq("status", data.status);
    if (data?.corretor_user_id) q = q.eq("corretor_user_id", data.corretor_user_id);
    if (data?.from) q = q.gte("created_at", data.from);
    if (data?.to) q = q.lte("created_at", data.to);
    const { data: reqs, error } = await q;
    if (error) throw new Error(error.message);

    const saleIds = [
      ...new Set((reqs ?? []).map((r) => r.sale_id).filter((v): v is string => !!v)),
    ];
    const corretorIds = (reqs ?? []).map((r) => r.corretor_user_id).filter((v): v is string => !!v);
    const gerenteIds = (reqs ?? []).map((r) => r.gerente_user_id).filter((v): v is string => !!v);
    const diretorIds = (reqs ?? []).map((r) => r.diretor_user_id).filter((v): v is string => !!v);
    const userIds = [...new Set([...corretorIds, ...gerenteIds, ...diretorIds])];
    const safeIds = saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: sales }, { data: profs }, { data: paidReqs }, { data: nfRows }] =
      await Promise.all([
        supabaseAdmin
          .from("sales")
          .select(
            "id,data,comprador,empreendimento,unidade,valor_venda,corretor,gerente,coaphar,comissao_liq_corretor,comissao_liq_gerente,status,valor_sinal_negocio",
          )
          .in("id", safeIds),
        supabaseAdmin
          .from("profiles")
          .select("id,display_name,email")
          .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
        // Todos pedidos PAGOS dessas vendas, para calcular adiantado/saldo + histórico por papel.
        supabaseAdmin
          .from("commission_requests")
          .select(
            "id,sale_id,tipo,valor_solicitado,status,paid_at,decided_at,created_at,requester_role",
          )
          .in("sale_id", safeIds)
          .eq("status", "pago"),
        supabaseAdmin
          .from("nf_requests")
          .select(
            "id,sale_id,status,created_at,numero_nf,arquivo_nf_url,arquivo_nf_url_2,requester_role",
          )
          .in("sale_id", safeIds)
          .order("created_at", { ascending: false }),
      ]);
    const sMap = new Map((sales ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    // Para cada venda, NF "ativa" mais recente (ignora canceladas) com arquivos disponíveis.
    const nfBySaleRole = new Map<
      string,
      { id: string; status: string; numero: string | null; hasFile1: boolean; hasFile2: boolean }
    >();
    for (const n of nfRows ?? []) {
      if (n.status === "cancelada") continue;
      const role = (n.requester_role ?? "corretor") as string;
      const key = `${n.sale_id}::${role}`;
      if (!nfBySaleRole.has(key)) {
        nfBySaleRole.set(key, {
          id: n.id as string,
          status: n.status as string,
          numero: (n.numero_nf as string | null) ?? null,
          hasFile1: !!n.arquivo_nf_url,
          hasFile2: !!n.arquivo_nf_url_2,
        });
      }
    }
    const paidBySaleRole = new Map<
      string,
      {
        adiantado: number;
        final: number;
        items: Array<{ id: string; tipo: string; valor: number; data: string | null }>;
      }
    >();
    for (const pr of paidReqs ?? []) {
      const role = (pr.requester_role ?? "corretor") as string;
      const key = `${pr.sale_id}::${role}`;
      const cur = paidBySaleRole.get(key) ?? { adiantado: 0, final: 0, items: [] };
      const v = Number(pr.valor_solicitado) || 0;
      if (pr.tipo === "adiantamento") cur.adiantado += v;
      else if (pr.tipo === "comissao_final") cur.final += v;
      cur.items.push({
        id: pr.id,
        tipo: pr.tipo,
        valor: v,
        data: (pr.paid_at ?? pr.decided_at ?? pr.created_at) as string | null,
      });
      paidBySaleRole.set(key, cur);
    }
    return (reqs ?? []).map((r) => {
      const sale = sMap.get(r.sale_id) ?? null;
      const role = ((r.requester_role ?? "corretor") as string) || "corretor";
      const comissaoLiq =
        role === "gerente"
          ? Number(
              (sale as { comissao_liq_gerente?: number | null } | null)?.comissao_liq_gerente,
            ) || 0
          : role === "diretor"
            ? calcDiretorComissao(
                sale?.valor_venda,
                (sale as { coaphar?: string | null } | null)?.coaphar,
              )
            : Number(sale?.comissao_liq_corretor) || 0;
      const roleKey = `${r.sale_id}::${role}`;
      const p = paidBySaleRole.get(roleKey) ?? { adiantado: 0, final: 0, items: [] };
      const aReceber = Math.max(0, comissaoLiq - p.adiantado - p.final);
      const nfInfo = nfBySaleRole.get(roleKey) ?? null;
      return {
        ...r,
        sale,
        corretor_profile: r.corretor_user_id ? (pMap.get(r.corretor_user_id) ?? null) : null,
        gerente_profile: r.gerente_user_id ? (pMap.get(r.gerente_user_id) ?? null) : null,
        diretor_profile: r.diretor_user_id ? (pMap.get(r.diretor_user_id) ?? null) : null,
        comissao_liq: comissaoLiq,
        adiantado_pago: p.adiantado,
        final_pago: p.final,
        a_receber: aReceber,
        historico: p.items.slice().sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")),
        nf_status: nfInfo?.status ?? null,
        nf_info: nfInfo,
      };
    });
  });

// ---------- APROVAR / NEGAR (financeiro) ----------
const DistratoApprovalSchema = z.object({
  distrato_id: z.string().uuid(),
  valor_desconto: z.number().positive().max(99999999),
  observacao: z.string().trim().max(2000).optional(),
});

const DecideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["aprovado", "negado"]),
  motivo: z.string().trim().max(2000).optional(),
  observacao: z.string().trim().max(2000).optional(),
  distrato_descontos: z.array(DistratoApprovalSchema).max(20).optional(),
});

export const decideRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    if (data.decision === "negado" && (!data.motivo || data.motivo.trim().length === 0))
      throw new Error("Motivo é obrigatório ao negar.");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("commission_requests")
      .select(
        "id,tipo,valor_solicitado,sale_id,corretor_user_id,gerente_user_id,diretor_user_id,requester_role,desconto_distrato,observacao_financeiro,status",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Pedido não encontrado.");
    if (req.status !== "pendente") throw new Error("Este pedido já foi decidido por outra pessoa.");

    const role = (req.requester_role ?? "corretor") as "corretor" | "gerente" | "diretor";
    const beneficiaryId =
      role === "gerente"
        ? req.gerente_user_id
        : role === "diretor"
          ? req.diretor_user_id
          : req.corretor_user_id;
    const descontosSelecionados = (data.distrato_descontos ?? []).filter(
      (d) => d.valor_desconto > 0,
    );
    let descontoTotal = 0;
    let descontoObs = "";
    const descontoRows: Array<{
      distrato_id: string;
      rec_id: string;
      valor: number;
      obs: string;
      comprador: string | null;
      empreendimento: string | null;
      unidade: string | null;
    }> = [];

    if (data.decision === "aprovado" && req.tipo === "comissao_final") {
      if (beneficiaryId) {
        const { data: recs, error: recErr } = await supabaseAdmin
          .from("distrato_recipients")
          .select("id,distrato_id,valor_devolver,valor_devolvido,status")
          .eq("user_id", beneficiaryId)
          .eq("role", role)
          .eq("status", "pendente");
        if (recErr) throw new Error(recErr.message);
        const pendentes = (recs ?? []).filter(
          (r) => Number(r.valor_devolver) - Number(r.valor_devolvido) > 0.001,
        );
        if (pendentes.length > 0 && descontosSelecionados.length === 0) {
          throw new Error("Há distrato pendente para este beneficiário. Revise o bloco de distrato antes de aprovar.");
        }
        if (descontosSelecionados.length > 0) {
          const recMap = new Map(pendentes.map((r) => [r.distrato_id, r]));
          const distIds = descontosSelecionados.map((d) => d.distrato_id);
          const { data: dists, error: distErr } = await supabaseAdmin
            .from("distratos")
            .select("id,comprador,empreendimento,unidade,status")
            .in("id", distIds);
          if (distErr) throw new Error(distErr.message);
          const distMap = new Map((dists ?? []).map((d) => [d.id, d]));
          for (const d of descontosSelecionados) {
            const rec = recMap.get(d.distrato_id);
            const dist = distMap.get(d.distrato_id);
            if (!rec || !dist || dist.status === "cancelado") {
              throw new Error("Um dos distratos selecionados não pertence a este beneficiário ou não está pendente.");
            }
            const saldo = Math.max(0, Number(rec.valor_devolver) - Number(rec.valor_devolvido));
            if (d.valor_desconto > saldo + 0.001) throw new Error("Valor de desconto excede o saldo do distrato.");
            descontoTotal += d.valor_desconto;
            const obs =
              d.observacao ||
              `Desconto referente ao distrato da venda — Cliente: ${dist.comprador ?? "—"} · ${dist.empreendimento ?? "—"} / ${dist.unidade ?? "—"}`;
            descontoRows.push({
              distrato_id: d.distrato_id,
              rec_id: rec.id,
              valor: d.valor_desconto,
              obs,
              comprador: dist.comprador,
              empreendimento: dist.empreendimento,
              unidade: dist.unidade,
            });
          }
          const disponivelPedido = Math.max(0, Number(req.valor_solicitado) - (Number(req.desconto_distrato) || 0));
          if (descontoTotal > disponivelPedido + 0.001) {
            throw new Error("Total de descontos excede o valor disponível neste pedido.");
          }
          descontoObs = descontoRows
            .map(
              (d) =>
                `${d.obs} — desconto: R$ ${d.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            )
            .join("\n");
        }
      }
    }

    // Update condicional para evitar race
    const observacaoFinanceiro = [data.observacao, descontoObs].filter(Boolean).join("\n") || null;
    const { data: upd, error } = await supabaseAdmin
      .from("commission_requests")
      .update({
        status: data.decision,
        motivo_negacao: data.decision === "negado" ? data.motivo : null,
        observacao_financeiro: observacaoFinanceiro,
        desconto_distrato:
          data.decision === "aprovado" && descontoTotal > 0
            ? (Number(req.desconto_distrato) || 0) + descontoTotal
            : Number(req.desconto_distrato) || 0,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pendente")
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd || upd.length === 0) throw new Error("Este pedido já foi decidido por outra pessoa.");

    if (data.decision === "aprovado" && descontoRows.length > 0) {
      for (const d of descontoRows) {
        const { error: insErr } = await supabaseAdmin.from("distrato_descontos").insert({
          distrato_id: d.distrato_id,
          commission_request_id: data.id,
          corretor_user_id: role === "corretor" ? req.corretor_user_id : null,
          gerente_user_id: role === "gerente" ? req.gerente_user_id : null,
          valor_desconto: d.valor,
          observacao: d.obs,
          aplicado_por: context.userId,
          status: "aplicado",
        });
        if (insErr) throw new Error(insErr.message);

        const { data: recAtual } = await supabaseAdmin
          .from("distrato_recipients")
          .select("valor_devolver,valor_devolvido")
          .eq("id", d.rec_id)
          .maybeSingle();
        const novoRecDevolvido = (Number(recAtual?.valor_devolvido) || 0) + d.valor;
        const recQuitado = novoRecDevolvido >= (Number(recAtual?.valor_devolver) || 0) - 0.001;
        await supabaseAdmin
          .from("distrato_recipients")
          .update({
            valor_devolvido: novoRecDevolvido,
            status: recQuitado ? "devolvido" : "pendente",
            devolvido_at: recQuitado ? new Date().toISOString() : null,
            devolvido_por: recQuitado ? context.userId : null,
          })
          .eq("id", d.rec_id);

        const { data: allRecs } = await supabaseAdmin
          .from("distrato_recipients")
          .select("valor_devolver,valor_devolvido")
          .eq("distrato_id", d.distrato_id);
        const totalDevolver = (allRecs ?? []).reduce((s, r) => s + (Number(r.valor_devolver) || 0), 0);
        const totalDevolvido = (allRecs ?? []).reduce((s, r) => s + (Number(r.valor_devolvido) || 0), 0);
        await supabaseAdmin
          .from("distratos")
          .update({
            valor_devolver: totalDevolver,
            valor_devolvido: totalDevolvido,
            status: totalDevolver > 0 && totalDevolvido >= totalDevolver - 0.001 ? "quitado_por_desconto" : "pendente_devolucao",
          })
          .eq("id", d.distrato_id);
      }
    }

    // Ao aprovar adiantamento: somar valor na planilha + abrir solicitação de NF.
    // Idempotente: o update acima usa .eq("status","pendente"), portanto este bloco
    // só executa uma única vez por pedido (transição pendente -> aprovado).
    let sheetWarning: string | undefined;
    if (data.decision === "aprovado") {
      if (req?.sale_id) {
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("data, empreendimento, unidade, comprador, valor_venda, corretor, gerente")
          .eq("id", req.sale_id)
          .single();

        // Soma o adiantamento na planilha:
        //  - Pedido do corretor → coluna K ("Adiant. Corr.")
        //  - Pedido do gerente  → coluna P ("Adiant. Gerente")
        if (sale && req.tipo === "adiantamento") {
          const role = (req.requester_role ?? "corretor") as "corretor" | "gerente" | "diretor";
          const valor = Number(req.valor_solicitado) || 0;
          try {
            let res: { ok: boolean; error?: string } | null = null;
            if (role === "corretor") res = await addAdvanceToSheet(sale, valor);
            else if (role === "gerente") res = await addManagerAdvanceToSheet(sale, valor);
            if (res && !res.ok) {
              sheetWarning = res.error;
              console.error(`addAdvance(${role}) (aprovação):`, res.error);
            }
          } catch (e) {
            console.error("addAdvance exception:", e);
            sheetWarning = e instanceof Error ? e.message : String(e);
          }
        }

        // Cria automaticamente solicitação de NF para o MESMO papel do pedido aprovado.
        // Se não houver NF ativa para a venda + papel, abre uma nova com o owner correto.
        try {
          const { data: active } = await supabaseAdmin
            .from("nf_requests")
            .select("id")
            .eq("sale_id", req.sale_id)
            .eq("requester_role", role)
            .in("status", ["solicitada", "emitida"])
            .maybeSingle();
          const valorLiquidoNF = Math.max(0, (Number(req.valor_solicitado) || 0) - descontoTotal);
          const distratoObsNF = descontoObs || null;
          const distratoIdNF = descontoRows[0]?.distrato_id ?? null;
          if (!active) {
            let corretorUserId: string | null =
              role === "corretor" ? (req.corretor_user_id ?? null) : null;
            const gerenteUserId: string | null =
              role === "gerente" ? (req.gerente_user_id ?? null) : null;
            const diretorUserId: string | null =
              role === "diretor" ? (req.diretor_user_id ?? null) : null;

            // Fallback: tenta resolver o corretor pelo nome da venda caso o pedido não traga user_id.
            if (role === "corretor" && !corretorUserId && sale?.corretor) {
              const { data: map } = await supabaseAdmin
                .from("broker_mapping")
                .select("user_id")
                .eq("corretor_nome", sale.corretor)
                .eq("ativo", true)
                .maybeSingle();
              corretorUserId = map?.user_id ?? null;
            }

            const hasOwner =
              (role === "corretor" && !!corretorUserId) ||
              (role === "gerente" && !!gerenteUserId) ||
              (role === "diretor" && !!diretorUserId);

            if (hasOwner) {
              const ownerLabel =
                role === "gerente" ? "Gerente" : role === "diretor" ? "Gestão" : "Corretor";
              const { error: nfErr } = await supabaseAdmin.from("nf_requests").insert({
                sale_id: req.sale_id,
                requester_role: role,
                corretor_user_id: corretorUserId,
                gerente_user_id: gerenteUserId,
                diretor_user_id: diretorUserId,
                solicitado_por: context.userId,
                status: "solicitada",
                valor_nf: valorLiquidoNF,
                distrato_id: distratoIdNF,
                desconto_distrato: descontoTotal,
                observacao_distrato: distratoObsNF,
                observacao_financeiro: `NF solicitada automaticamente após aprovação de ${req.tipo === "adiantamento" ? "adiantamento" : "comissão"} (${ownerLabel}) — valor aprovado: R$ ${(Number(req.valor_solicitado) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${descontoTotal > 0 ? `; desconto de distrato: R$ ${descontoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; líquido para emissão: R$ ${valorLiquidoNF.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}.`,
              });
              if (nfErr) console.error("auto-create nf_request insert:", nfErr);
            } else {
              console.warn(
                `auto-create nf_request: sem owner para papel ${role} na venda ${req.sale_id}`,
              );
            }
          } else if (req.tipo === "comissao_final") {
            const { data: currentNf } = await supabaseAdmin
              .from("nf_requests")
              .select("desconto_distrato,observacao_distrato")
              .eq("id", active.id)
              .maybeSingle();
            await supabaseAdmin
              .from("nf_requests")
              .update({
                valor_nf: valorLiquidoNF,
                distrato_id: distratoIdNF,
                desconto_distrato: (Number(currentNf?.desconto_distrato) || 0) + descontoTotal,
                observacao_distrato: [currentNf?.observacao_distrato, distratoObsNF].filter(Boolean).join("\n") || null,
              })
              .eq("id", active.id);
          }
        } catch (e) {
          console.error("auto-create nf_request:", e);
        }
      }
    }
    return { ok: true, sheetWarning };
  });

// ---------- REMOVER BÔNUS (financeiro) ----------
// O financeiro pode zerar o bônus de um pedido em qualquer status diferente de "pago".
// Após remoção, os cálculos passam a desconsiderar o bônus daquele pedido.
const RemoveBonusSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().max(500).optional(),
});
export const removeBonusFromRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveBonusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: cur } = await supabaseAdmin
      .from("commission_requests")
      .select("id,status,bonus_corretor,observacao_financeiro")
      .eq("id", data.id)
      .maybeSingle();
    if (!cur) throw new Error("Pedido não encontrado.");
    if (cur.status === "pago") throw new Error("Pedido já pago — bônus não pode ser removido.");
    if (!Number(cur.bonus_corretor)) throw new Error("Este pedido não possui bônus.");
    const stamp = `[${new Date().toLocaleString("pt-BR")}] Bônus removido pelo financeiro (R$ ${Number(cur.bonus_corretor).toFixed(2)})${data.motivo ? ` — ${data.motivo}` : ""}.`;
    const novaObs = [cur.observacao_financeiro, stamp].filter(Boolean).join("\n");
    const { error } = await supabaseAdmin
      .from("commission_requests")
      .update({ bonus_corretor: 0, observacao_financeiro: novaObs })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- MARCAR COMO PAGO ----------
const PaidSchema = z.object({
  id: z.string().uuid(),
  observacao: z.string().trim().max(2000).optional(),
});

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
      if (!own || own.corretor_user_id !== context.userId) throw new Error("Acesso negado.");
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
    // Antes de marcar como pago: exigir que a NF da venda (se houver) esteja recebida.
    const { data: reqRow } = await supabaseAdmin
      .from("commission_requests")
      .select("sale_id,status,requester_role")
      .eq("id", data.id)
      .maybeSingle();
    if (!reqRow) throw new Error("Pedido não encontrado.");
    if (reqRow.sale_id) {
      const role = (reqRow.requester_role ?? "corretor") as string;
      const roleLabel = role === "gerente" ? "gerente" : role === "diretor" ? "Gestão" : "corretor";
      const { data: nfRows } = await supabaseAdmin
        .from("nf_requests")
        .select("status,created_at")
        .eq("sale_id", reqRow.sale_id)
        .eq("requester_role", role)
        .neq("status", "cancelada")
        .order("created_at", { ascending: false })
        .limit(1);
      const nfActive = nfRows?.[0];
      if (!nfActive) {
        throw new Error(`Pagamento só pode ser efetuado após o recebimento da NF do ${roleLabel}.`);
      }
      if (nfActive.status !== "recebida") {
        throw new Error(
          nfActive.status === "emitida"
            ? "Aguardando confirmação de recebimento da NF para liberar o pagamento."
            : `Pagamento só pode ser efetuado após o recebimento da NF do ${roleLabel}.`,
        );
      }
    }
    // Transição atômica pendente|aprovado -> pago. Apenas o primeiro (financeiro OU corretor)
    // consegue marcar; o segundo recebe erro e nada é duplicado na planilha.
    // Brokers can only confirm receipt of payments already APPROVED by financeiro.
    // Staff (financeiro/admin) can transition from pendente or aprovado.
    const allowedStatuses: Array<"pendente" | "aprovado"> = isStaff
      ? ["pendente", "aprovado"]
      : ["aprovado"];
    const { data: upd, error } = await supabaseAdmin
      .from("commission_requests")
      .update(patch)
      .eq("id", data.id)
      .in("status", allowedStatuses)
      .select("id, tipo, valor_solicitado, sale_id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("Pedido já foi marcado como pago.");

    // Planilha: já foi atualizada no momento da aprovação (decideRequest).
    // Aqui não somamos novamente para evitar duplicação.
    return { ok: true };
  });
