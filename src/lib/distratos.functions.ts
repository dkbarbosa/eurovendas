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
const RecipientSchema = z.object({
  role: z.enum(["corretor", "gerente", "diretor"]),
  user_id: z.string().uuid().nullable().optional(),
  nome: z.string().trim().max(200).nullable().optional(),
  valor_devolver: z.number().nonnegative().max(99999999),
});
const CreateSchema = z.object({
  sale_id: z.string().uuid(),
  motivo: z.string().trim().min(3).max(2000),
  observacao_financeiro: z.string().trim().max(2000).optional(),
  recipients: z.array(RecipientSchema).min(1, "Selecione ao menos 1 beneficiário"),
});

export const createDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("distratos")
      .select("id,status")
      .eq("sale_id", data.sale_id)
      .neq("status", "cancelado")
      .maybeSingle();
    if (existing) throw new Error("Já existe um distrato registrado para esta venda.");

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id,corretor,gerente,comprador,empreendimento,unidade,data,valor_venda,comissao_liq_gerente")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (saleErr) throw new Error(saleErr.message);
    if (!sale) throw new Error("Venda não encontrada.");

    const recipients = data.recipients.filter((r) => r.valor_devolver > 0);
    if (recipients.length === 0) throw new Error("Informe o valor de pelo menos 1 beneficiário.");
    const totalDevolver = recipients.reduce((s, r) => s + r.valor_devolver, 0);

    const { data: paidRows } = await supabaseAdmin
      .from("commission_requests")
      .select("id,tipo,valor_solicitado,corretor_user_id,gerente_user_id,diretor_user_id,requester_role")
      .eq("sale_id", data.sale_id)
      .eq("status", "pago");
    const items = paidRows ?? [];
    const sumBy = (role: string, tipo: string) =>
      items
        .filter((r) => (r.requester_role ?? "corretor") === role && r.tipo === tipo)
        .reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);

    const corretorRec = recipients.find((r) => r.role === "corretor");
    const gerenteRec = recipients.find((r) => r.role === "gerente");

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("distratos")
      .insert({
        sale_id: sale.id,
        corretor_user_id: corretorRec?.user_id ?? null,
        corretor_nome: corretorRec?.nome ?? sale.corretor,
        gerente_user_id: gerenteRec?.user_id ?? null,
        gerente_nome: gerenteRec?.nome ?? sale.gerente,
        comprador: sale.comprador,
        empreendimento: sale.empreendimento,
        unidade: sale.unidade,
        valor_devolver: totalDevolver,
        valor_adiantamento: sumBy("corretor", "adiantamento"),
        valor_comissao_final: sumBy("corretor", "comissao_final"),
        valor_adiantamento_gerente: sumBy("gerente", "adiantamento"),
        valor_comissao_final_gerente: sumBy("gerente", "comissao_final"),
        valor_comissao_gerente: Number(sale.comissao_liq_gerente) || 0,
        motivo: data.motivo,
        observacao_financeiro: data.observacao_financeiro ?? null,
        created_by: context.userId,
        status: "pendente_devolucao",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { error: recErr } = await supabaseAdmin.from("distrato_recipients").insert(
      recipients.map((r) => ({
        distrato_id: ins.id,
        role: r.role,
        user_id: r.user_id ?? null,
        nome: r.nome ?? null,
        valor_devolver: r.valor_devolver,
        valor_devolvido: 0,
        status: "pendente",
      })),
    );
    if (recErr) throw new Error(recErr.message);

    const ids = items.map((r) => r.id);
    if (ids.length > 0) {
      await supabaseAdmin.from("commission_requests").update({ status: "distratado" }).in("id", ids);
    }

    await supabaseAdmin.from("sales").update({ status: "DISTRATO" }).eq("id", sale.id);
    try {
      const { setSheetStatus } = await import("./sheets-write.server");
      const res = await setSheetStatus(
        {
          data: sale.data ?? null,
          empreendimento: sale.empreendimento ?? null,
          unidade: sale.unidade ?? null,
          comprador: sale.comprador ?? null,
          valor_venda: sale.valor_venda ?? null,
        },
        "DISTRATO",
      );
      if (!res.ok) console.warn("[distrato] sheets status update failed:", res.error);
    } catch (e) {
      console.warn("[distrato] sheets status update error:", e);
    }

    return { ok: true, id: ins.id };
  });

// ---------- LISTAR VENDAS PARA DISTRATO (financeiro) ----------
export type SaleRecipientBreakdown = {
  role: "corretor" | "gerente" | "diretor";
  user_id: string | null;
  nome: string | null;
  adiant: number;
  final: number;
  total: number;
};

export const listSalesForDistrato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceiro(context.userId);
    const [{ data: sales }, { data: reqs }, { data: dists }] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .select("id,data,comprador,empreendimento,unidade,valor_venda,corretor,gerente,status")
        .order("data", { ascending: false })
        .limit(3000),
      supabaseAdmin
        .from("commission_requests")
        .select("sale_id,tipo,valor_solicitado,status,requester_role,corretor_user_id,gerente_user_id,diretor_user_id")
        .eq("status", "pago"),
      supabaseAdmin
        .from("distratos")
        .select("sale_id,status")
        .neq("status", "cancelado"),
    ]);
    const distSet = new Set((dists ?? []).map((d) => d.sale_id));

    // Mapas auxiliares para resolver nomes/user_ids
    const allReqs = reqs ?? [];
    const userIds = new Set<string>();
    for (const r of allReqs) {
      if (r.corretor_user_id) userIds.add(r.corretor_user_id);
      if (r.gerente_user_id) userIds.add(r.gerente_user_id);
      if (r.diretor_user_id) userIds.add(r.diretor_user_id);
    }
    const profsRes = userIds.size
      ? await supabaseAdmin.from("profiles").select("id,display_name,email").in("id", [...userIds])
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const profMap = new Map((profsRes.data ?? []).map((p) => [p.id, p]));

    type Bd = { adiant: number; final: number; user_id: string | null; nome: string | null };
    const breakdown = new Map<string, Record<string, Bd>>(); // sale_id -> role -> bd

    for (const r of allReqs) {
      const role = (r.requester_role ?? "corretor") as "corretor" | "gerente" | "diretor";
      const map = breakdown.get(r.sale_id) ?? {};
      const uid =
        role === "corretor"
          ? r.corretor_user_id
          : role === "gerente"
            ? r.gerente_user_id
            : r.diretor_user_id;
      const prof = uid ? profMap.get(uid) : null;
      const cur = map[role] ?? { adiant: 0, final: 0, user_id: uid ?? null, nome: prof?.display_name ?? prof?.email ?? null };
      if (r.tipo === "adiantamento") cur.adiant += Number(r.valor_solicitado) || 0;
      else if (r.tipo === "comissao_final") cur.final += Number(r.valor_solicitado) || 0;
      if (!cur.user_id && uid) cur.user_id = uid;
      if (!cur.nome && prof) cur.nome = prof.display_name ?? prof.email ?? null;
      map[role] = cur;
      breakdown.set(r.sale_id, map);
    }

    return (sales ?? []).map((s) => {
      const map = breakdown.get(s.id) ?? {};
      const recipients: SaleRecipientBreakdown[] = (
        ["corretor", "gerente", "diretor"] as const
      )
        .filter((role) => map[role] && (map[role].adiant + map[role].final) > 0)
        .map((role) => ({
          role,
          user_id: map[role].user_id,
          nome:
            map[role].nome ??
            (role === "corretor" ? s.corretor : role === "gerente" ? s.gerente : null),
          adiant: map[role].adiant,
          final: map[role].final,
          total: map[role].adiant + map[role].final,
        }));
      const totalPago = recipients.reduce((acc, r) => acc + r.total, 0);
      const adiantTotal = recipients.reduce((acc, r) => acc + r.adiant, 0);
      const finalTotal = recipients.reduce((acc, r) => acc + r.final, 0);
      return {
        ...s,
        valor_adiantamento_pago: adiantTotal,
        valor_comissao_final_pago: finalTotal,
        total_pago: totalPago,
        ja_distratada: distSet.has(s.id),
        recipients,
      };
    });
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
    if (data?.status) q = q.eq("status", data.status);
    if (isStaff && data?.corretor_user_id) q = q.eq("corretor_user_id", data.corretor_user_id);
    if (data?.from) q = q.gte("created_at", data.from);
    if (data?.to) q = q.lte("created_at", data.to);

    const { data: rowsRaw, error } = await q;
    if (error) throw new Error(error.message);
    let rows = rowsRaw ?? [];

    // Para não-staff: filtrar distratos onde o user é beneficiário
    if (!isStaff) {
      const ids = rows.map((r) => r.id);
      const { data: myRecs } = ids.length
        ? await supabaseAdmin
            .from("distrato_recipients")
            .select("distrato_id")
            .eq("user_id", context.userId)
            .in("distrato_id", ids)
        : { data: [] };
      const mineSet = new Set((myRecs ?? []).map((r) => r.distrato_id));
      rows = rows.filter(
        (r) =>
          r.corretor_user_id === context.userId ||
          r.gerente_user_id === context.userId ||
          mineSet.has(r.id),
      );
    }

    // Enriquecer com profile do corretor + recipients
    type RecipientRow = {
      id: string;
      distrato_id: string;
      user_id: string | null;
      role: string;
      nome: string | null;
      valor_devolver: number;
      valor_devolvido: number;
      status: string;
      devolvido_at: string | null;
      observacao_recebimento: string | null;
      created_at: string;
    };
    const userIds = [...new Set(rows.map((r) => r.corretor_user_id).filter((v): v is string => !!v))];
    const ids = rows.map((r) => r.id);
    const [{ data: profs }, recRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      ids.length
        ? supabaseAdmin
            .from("distrato_recipients")
            .select("id,distrato_id,user_id,role,nome,valor_devolver,valor_devolvido,status,devolvido_at,observacao_recebimento,created_at")
            .in("distrato_id", ids)
        : Promise.resolve({ data: [] as RecipientRow[] }),
    ]);
    const recipients = (recRes.data ?? []) as RecipientRow[];
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const recMap = new Map<string, RecipientRow[]>();
    for (const r of recipients) {
      const arr = recMap.get(r.distrato_id) ?? [];
      arr.push(r);
      recMap.set(r.distrato_id, arr);
    }
    return rows.map((r) => ({
      ...r,
      corretor_profile: r.corretor_user_id ? pMap.get(r.corretor_user_id) ?? null : null,
      recipients: recMap.get(r.id) ?? [],
    }));
  });

// ---------- MARCAR DEVOLVIDO (em dinheiro, total ou parcial) ----------
const MarkSchema = z.object({
  id: z.string().uuid(),
  recipient_id: z.string().uuid().optional(),
  observacao_recebimento: z.string().trim().max(2000).optional(),
  valor: z.number().positive().max(99999999).optional(),
});
export const markDistratoDevolvido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: dist } = await supabaseAdmin
      .from("distratos")
      .select("id,valor_devolver,valor_devolvido,status")
      .eq("id", data.id)
      .maybeSingle();
    if (!dist) throw new Error("Distrato não encontrado.");
    if (dist.status !== "pendente_devolucao")
      throw new Error("Distrato não está pendente.");

    // Modo per-recipient (preferido quando há beneficiários)
    if (data.recipient_id) {
      const { data: rec } = await supabaseAdmin
        .from("distrato_recipients")
        .select("id,valor_devolver,valor_devolvido,status,distrato_id")
        .eq("id", data.recipient_id)
        .maybeSingle();
      if (!rec) throw new Error("Beneficiário não encontrado.");
      if (rec.distrato_id !== data.id) throw new Error("Beneficiário não pertence ao distrato.");
      if (rec.status !== "pendente") throw new Error("Beneficiário já quitado.");
      const saldoRec = Math.max(0, Number(rec.valor_devolver) - Number(rec.valor_devolvido));
      const valor = data.valor ?? saldoRec;
      if (valor > saldoRec + 0.001) throw new Error("Valor excede o saldo do beneficiário.");
      const novoRec = Number(rec.valor_devolvido) + valor;
      const quitRec = novoRec >= Number(rec.valor_devolver) - 0.001;
      await supabaseAdmin
        .from("distrato_recipients")
        .update({
          valor_devolvido: novoRec,
          status: quitRec ? "devolvido" : "pendente",
          devolvido_at: quitRec ? new Date().toISOString() : null,
          devolvido_por: quitRec ? context.userId : null,
          observacao_recebimento: data.observacao_recebimento ?? null,
        })
        .eq("id", rec.id);
    } else {
      const saldo = Math.max(0, Number(dist.valor_devolver) - Number(dist.valor_devolvido));
      const valor = data.valor ?? saldo;
      if (valor > saldo + 0.001) throw new Error("Valor excede o saldo restante.");
    }

    // Recalcula o total do distrato a partir dos recipients
    const { data: allRec } = await supabaseAdmin
      .from("distrato_recipients")
      .select("valor_devolvido,valor_devolver,status")
      .eq("distrato_id", data.id);
    const totalDevolvido = (allRec ?? []).reduce((s, r) => s + Number(r.valor_devolvido), 0);
    const totalDevolver = Number(dist.valor_devolver);
    const allDone =
      (allRec ?? []).length > 0 && (allRec ?? []).every((r) => r.status !== "pendente");
    const quitado = allDone || totalDevolvido >= totalDevolver - 0.001;

    // Sem recipients (registros antigos), usa modo legacy
    let novoDevolvidoDist: number;
    if ((allRec ?? []).length === 0 && !data.recipient_id) {
      novoDevolvidoDist = Number(dist.valor_devolvido) + (data.valor ?? Math.max(0, totalDevolver - Number(dist.valor_devolvido)));
    } else {
      novoDevolvidoDist = totalDevolvido;
    }

    const { error } = await supabaseAdmin
      .from("distratos")
      .update({
        valor_devolvido: novoDevolvidoDist,
        status: quitado ? "devolvido" : "pendente_devolucao",
        devolvido_at: quitado ? new Date().toISOString() : null,
        devolvido_por: quitado ? context.userId : null,
        observacao_recebimento: data.observacao_recebimento ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- MINHAS PENDÊNCIAS COMO BENEFICIÁRIO (corretor/gerente/gestão) ----------
export const listMyDistratoRecipientPendencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: recs } = await supabaseAdmin
      .from("distrato_recipients")
      .select("id,distrato_id,role,valor_devolver,valor_devolvido,status,observacao_recebimento,created_at,updated_at")
      .eq("user_id", context.userId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(500);
    const list = (recs ?? []).filter(
      (r) => Number(r.valor_devolver) - Number(r.valor_devolvido) > 0.001,
    );
    if (list.length === 0) return [];
    const distIds = [...new Set(list.map((r) => r.distrato_id))];
    const { data: dists } = await supabaseAdmin
      .from("distratos")
      .select("id,comprador,empreendimento,unidade,motivo,sale_id,created_at,observacao_financeiro,observacao_recebimento")
      .in("id", distIds);
    const dMap = new Map((dists ?? []).map((d) => [d.id, d]));
    return list.map((r) => ({
      ...r,
      saldo: Math.max(0, Number(r.valor_devolver) - Number(r.valor_devolvido)),
      distrato: dMap.get(r.distrato_id) ?? null,
    }));
  });

// ---------- LISTAR PENDÊNCIAS (com saldo > 0) ----------
// Suporta beneficiário corretor (distratos.corretor_user_id), gerente
// (distratos.gerente_user_id) e diretor (via distrato_recipients).
export const listPendenciasDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        corretor_user_id: z.string().uuid().optional(),
        gerente_user_id: z.string().uuid().optional(),
        diretor_user_id: z.string().uuid().optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("financeiro") || roles.includes("admin");

    // Diretor: distratos.* não tem coluna diretor_user_id, então olhamos recipients
    if (isStaff && data?.diretor_user_id) {
      const { data: recs } = await supabaseAdmin
        .from("distrato_recipients")
        .select("distrato_id,valor_devolver,valor_devolvido,status")
        .eq("user_id", data.diretor_user_id)
        .eq("role", "diretor")
        .eq("status", "pendente");
      const pend = (recs ?? []).filter(
        (r) => Number(r.valor_devolver) - Number(r.valor_devolvido) > 0.001,
      );
      if (pend.length === 0) return [];
      const saldoMap = new Map<string, number>();
      for (const r of pend) {
        saldoMap.set(
          r.distrato_id,
          (saldoMap.get(r.distrato_id) ?? 0) +
            (Number(r.valor_devolver) - Number(r.valor_devolvido)),
        );
      }
      const ids = [...saldoMap.keys()];
      const { data: dists } = await supabaseAdmin
        .from("distratos")
        .select("id,sale_id,comprador,empreendimento,unidade,status,created_at")
        .in("id", ids)
        .neq("status", "cancelado");
      return (dists ?? []).map((d) => ({
        ...d,
        corretor_user_id: null,
        corretor_nome: null,
        valor_devolver: saldoMap.get(d.id) ?? 0,
        valor_devolvido: 0,
        saldo_restante: saldoMap.get(d.id) ?? 0,
      }));
    }

    let q = supabaseAdmin
      .from("distratos")
      .select("id,sale_id,corretor_user_id,gerente_user_id,corretor_nome,comprador,empreendimento,unidade,valor_devolver,valor_devolvido,status,created_at")
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!isStaff) q = q.eq("corretor_user_id", context.userId);
    else if (data?.gerente_user_id) q = q.eq("gerente_user_id", data.gerente_user_id);
    else if (data?.corretor_user_id) q = q.eq("corretor_user_id", data.corretor_user_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .map((r) => ({
        ...r,
        saldo_restante: Math.max(0, Number(r.valor_devolver) - Number(r.valor_devolvido)),
      }))
      .filter((r) => r.saldo_restante > 0.001);
  });

// ---------- APLICAR DESCONTO EM PEDIDO APROVADO ----------
const AplicarSchema = z.object({
  distrato_id: z.string().uuid(),
  commission_request_id: z.string().uuid(),
  valor_desconto: z.number().positive().max(99999999),
  observacao: z.string().trim().max(2000).optional(),
});
export const aplicarDescontoDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AplicarSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const [{ data: dist }, { data: req }] = await Promise.all([
      supabaseAdmin
        .from("distratos")
        .select("id,corretor_user_id,gerente_user_id,valor_devolver,valor_devolvido,status")
        .eq("id", data.distrato_id)
        .maybeSingle(),
      supabaseAdmin
        .from("commission_requests")
        .select("id,corretor_user_id,gerente_user_id,diretor_user_id,requester_role,valor_solicitado,desconto_distrato,status,sale_id")
        .eq("id", data.commission_request_id)
        .maybeSingle(),
    ]);
    if (!dist) throw new Error("Distrato não encontrado.");
    if (!req) throw new Error("Pedido não encontrado.");
    if (dist.status === "cancelado") throw new Error("Distrato cancelado.");
    if (req.status !== "aprovado")
      throw new Error("Desconto só pode ser vinculado a pedidos APROVADOS (ainda não pagos).");

    const isGerReq = req.requester_role === "gerente";
    const isDirReq = req.requester_role === "diretor";
    if (isGerReq) {
      if (dist.gerente_user_id && req.gerente_user_id && dist.gerente_user_id !== req.gerente_user_id)
        throw new Error("Distrato e pedido pertencem a gerentes diferentes.");
    } else if (isDirReq) {
      // Para diretor validamos via distrato_recipients (sem coluna direta)
      const { data: recDir } = await supabaseAdmin
        .from("distrato_recipients")
        .select("id,valor_devolver,valor_devolvido")
        .eq("distrato_id", data.distrato_id)
        .eq("role", "diretor")
        .eq("user_id", req.diretor_user_id as string)
        .eq("status", "pendente")
        .maybeSingle();
      if (!recDir) throw new Error("Distrato sem pendência para este diretor.");
    } else {
      if (dist.corretor_user_id && req.corretor_user_id && dist.corretor_user_id !== req.corretor_user_id)
        throw new Error("Distrato e pedido pertencem a corretores diferentes.");
    }

    const saldoDist = Math.max(0, Number(dist.valor_devolver) - Number(dist.valor_devolvido));
    const descontoAtual = Number(req.desconto_distrato) || 0;
    const restanteRequest = Math.max(0, Number(req.valor_solicitado) - descontoAtual);
    if (data.valor_desconto > saldoDist + 0.001)
      throw new Error(`Valor excede o saldo do distrato.`);
    if (data.valor_desconto > restanteRequest + 0.001)
      throw new Error(`Valor excede o disponível neste pedido.`);

    const { error: insErr } = await supabaseAdmin.from("distrato_descontos").insert({
      distrato_id: data.distrato_id,
      commission_request_id: data.commission_request_id,
      corretor_user_id: isGerReq || isDirReq ? null : req.corretor_user_id,
      gerente_user_id: isGerReq ? req.gerente_user_id : null,
      valor_desconto: data.valor_desconto,
      observacao: data.observacao ?? null,
      aplicado_por: context.userId,
      status: "aplicado",
    });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin
      .from("commission_requests")
      .update({ desconto_distrato: descontoAtual + data.valor_desconto })
      .eq("id", data.commission_request_id);

    const novoDevolvido = Number(dist.valor_devolvido) + data.valor_desconto;
    const quitado = novoDevolvido >= Number(dist.valor_devolver) - 0.001;
    await supabaseAdmin
      .from("distratos")
      .update({
        valor_devolvido: novoDevolvido,
        status: quitado ? "quitado_por_desconto" : "pendente_devolucao",
      })
      .eq("id", data.distrato_id);

    // Para diretor: também marca o recipient como devolvido (parcial/total)
    if (isDirReq) {
      const { data: recDir2 } = await supabaseAdmin
        .from("distrato_recipients")
        .select("id,valor_devolver,valor_devolvido")
        .eq("distrato_id", data.distrato_id)
        .eq("role", "diretor")
        .eq("user_id", req.diretor_user_id as string)
        .maybeSingle();
      if (recDir2) {
        const novo = Number(recDir2.valor_devolvido) + data.valor_desconto;
        const quit = novo >= Number(recDir2.valor_devolver) - 0.001;
        await supabaseAdmin
          .from("distrato_recipients")
          .update({
            valor_devolvido: novo,
            status: quit ? "devolvido" : "pendente",
            devolvido_at: quit ? new Date().toISOString() : null,
            devolvido_por: quit ? context.userId : null,
          })
          .eq("id", recDir2.id);
      }
    }

    return { ok: true };
  });


// ---------- ESTORNAR DESCONTO ----------
export const estornarDescontoDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);
    const { data: dd } = await supabaseAdmin
      .from("distrato_descontos")
      .select("id,distrato_id,commission_request_id,valor_desconto,status")
      .eq("id", data.id)
      .maybeSingle();
    if (!dd) throw new Error("Desconto não encontrado.");
    if (dd.status !== "aplicado") throw new Error("Desconto já estornado.");

    await supabaseAdmin
      .from("distrato_descontos")
      .update({ status: "estornado", estornado_por: context.userId, estornado_at: new Date().toISOString() })
      .eq("id", data.id);

    const { data: req } = await supabaseAdmin
      .from("commission_requests").select("desconto_distrato")
      .eq("id", dd.commission_request_id).maybeSingle();
    if (req) {
      await supabaseAdmin
        .from("commission_requests")
        .update({ desconto_distrato: Math.max(0, Number(req.desconto_distrato) - Number(dd.valor_desconto)) })
        .eq("id", dd.commission_request_id);
    }
    const { data: dist } = await supabaseAdmin
      .from("distratos").select("valor_devolvido,status")
      .eq("id", dd.distrato_id).maybeSingle();
    if (dist) {
      await supabaseAdmin
        .from("distratos")
        .update({
          valor_devolvido: Math.max(0, Number(dist.valor_devolvido) - Number(dd.valor_desconto)),
          status: dist.status === "quitado_por_desconto" ? "pendente_devolucao" : dist.status,
        })
        .eq("id", dd.distrato_id);
    }
    return { ok: true };
  });

// ---------- LISTAR DESCONTOS DE UM DISTRATO ----------
export const listDescontosByDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ distrato_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Staff (admin/financeiro) vê tudo; corretor só vê descontos dele.
    const roles = await getRoles(context.userId);
    const isStaff = roles.includes("admin") || roles.includes("financeiro");
    let q = supabaseAdmin
      .from("distrato_descontos")
      .select("*")
      .eq("distrato_id", data.distrato_id)
      .order("aplicado_at", { ascending: false });
    if (!isStaff) q = q.eq("corretor_user_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
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

// ---------- APAGAR DISTRATO (financeiro/admin) ----------
// Remove o registro do distrato e reverte os efeitos: pedidos voltam para 'pago'
// e o status da venda volta para 'PAGO' (Supabase + planilha do Google Sheets).
export const deleteDistrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin") && !roles.includes("financeiro"))
      throw new Error("Apenas Financeiro ou Admin podem apagar distratos.");

    const { data: d, error: e1 } = await supabaseAdmin
      .from("distratos")
      .select("sale_id")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!d) throw new Error("Distrato não encontrado.");

    // 1) Reverte pedidos 'distratado' -> 'pago'
    await supabaseAdmin
      .from("commission_requests")
      .update({ status: "pago" })
      .eq("sale_id", d.sale_id)
      .eq("status", "distratado");

    // 2) Reverte status da venda (Supabase + Sheets)
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("id,data,empreendimento,unidade,comprador,valor_venda,status")
      .eq("id", d.sale_id)
      .maybeSingle();

    if (sale && sale.status === "DISTRATO") {
      await supabaseAdmin.from("sales").update({ status: "PAGO" }).eq("id", sale.id);
      try {
        const { setSheetStatus } = await import("./sheets-write.server");
        const res = await setSheetStatus(
          {
            data: sale.data ?? null,
            empreendimento: sale.empreendimento ?? null,
            unidade: sale.unidade ?? null,
            comprador: sale.comprador ?? null,
            valor_venda: sale.valor_venda ?? null,
          },
          "PAGO",
        );
        if (!res.ok) console.warn("[distrato:delete] sheets status revert failed:", res.error);
      } catch (e) {
        console.warn("[distrato:delete] sheets status revert error:", e);
      }
    }

    // 3) Apaga o registro
    const { error } = await supabaseAdmin.from("distratos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
