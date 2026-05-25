import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import React, { useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { listMyBrokerSales, listDistinctCorretores } from "@/lib/commissions.functions";
import { createCommissionRequest, deleteCommissionRequest, markRequestPaid } from "@/lib/requests.functions";
import { markNFEmitted, deleteNFRequest, markNFPaid } from "@/lib/nf.functions";
import { GroupedNFEmitter, type PendingNFItem } from "@/components/nf/GroupedNFEmitter";

import { listDistratos } from "@/lib/distratos.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/CurrencyInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Wallet, TrendingUp, FileText, Receipt, CheckCircle2, Clock, XCircle, Search, Trash2, AlertTriangle, MessageSquareWarning, MessageSquare, Ban, Send, Timer, Paperclip, X } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: ComissoesPage,
  head: () => ({ meta: [{ title: "Comissões · Gestão Comercial" }] }),
});

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type DescontoInfo = {
  id: string;
  commission_request_id: string;
  distrato_id: string;
  valor_desconto: number;
  status: string;
  aplicado_at: string | null;
  observacao: string | null;
  distrato: {
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    valor_devolver: number | null;
    valor_adiantamento: number | null;
    valor_comissao_final: number | null;
    data_venda: string | null;
  } | null;
};


const money = (n: number | null | undefined) => Math.round((Number(n) || 0) * 100) / 100;

// Formata "YYYY-MM-DD" (vindo do tipo date do Postgres) como DD/MM/YYYY
// sem deslocamento de fuso horário.
const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const firstDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const lastDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

function ComissoesPage() {
  const { isStaff, isAdmin, corretorNome: myName } = useAuth();
  const qc = useQueryClient();

  const fnSales = useServerFn(listMyBrokerSales);
  const fnDistinct = useServerFn(listDistinctCorretores);
  const fnCreate = useServerFn(createCommissionRequest);
  const fnEmit = useServerFn(markNFEmitted);
  const fnDelReq = useServerFn(deleteCommissionRequest);
  const fnDelNF = useServerFn(deleteNFRequest);
  const fnPayNF = useServerFn(markNFPaid);
  const fnPaid = useServerFn(markRequestPaid);
  const fnDistratos = useServerFn(listDistratos);


  const [staffSelectedBroker, setStaffSelectedBroker] = usePersistentState<string | undefined>(
    "comissoes:staffSelectedBroker",
    undefined,
  );
  const activeBrokerArg = isStaff ? staffSelectedBroker : undefined;

  // ---- Filtros ----
  const [dateFrom, setDateFrom] = usePersistentState<string>("comissoes:dateFrom", firstDayOfMonth());
  const [dateTo, setDateTo] = usePersistentState<string>("comissoes:dateTo", lastDayOfMonth());
  const [clientSearch, setClientSearch] = usePersistentState<string>("comissoes:clientSearch", "");

  const { data: brokers = [] } = useQuery({
    queryKey: ["distinct-corretores"],
    queryFn: () => fnDistinct(),
    enabled: isStaff,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-broker-sales", activeBrokerArg ?? myName],
    queryFn: () => fnSales({ data: activeBrokerArg ? { corretorNome: activeBrokerArg } : undefined }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });


  const allSales = data?.sales ?? [];
  const rawRequests = data?.requests ?? [];
  const rawNfs = data?.nfs ?? [];
  const requests = useMemo(
    () => rawRequests.filter((r) => {
      const role = ((r as { requester_role?: string | null }).requester_role ?? "corretor") || "corretor";
      return role === "corretor" && !(r as { gerente_user_id?: string | null }).gerente_user_id && !(r as { diretor_user_id?: string | null }).diretor_user_id;
    }),
    [rawRequests],
  );
  const nfs = useMemo(
    () => rawNfs.filter((n) => {
      const role = ((n as { requester_role?: string | null }).requester_role ?? "corretor") || "corretor";
      return role === "corretor" && !(n as { gerente_user_id?: string | null }).gerente_user_id && !(n as { diretor_user_id?: string | null }).diretor_user_id;
    }),
    [rawNfs],
  );
  const descontosAll = (data as { descontos?: DescontoInfo[] } | undefined)?.descontos ?? [];
  const displayName = data?.corretorNome ?? null;

  // descontos agrupados por commission_request_id
  const descontosByRequest = useMemo(() => {
    const m = new Map<string, DescontoInfo[]>();
    for (const d of descontosAll) {
      const arr = m.get(d.commission_request_id) ?? [];
      arr.push(d);
      m.set(d.commission_request_id, arr);
    }
    return m;
  }, [descontosAll]);


  // Vendas com qualquer evento em aberto (pedido não pago OU NF
  // solicitada/emitida/recebida) permanecem sempre visíveis —
  // independentemente do período. Assim, quando o financeiro abrir uma
  // solicitação de NF de uma venda antiga, ela reaparece automaticamente.
  const salesWithOpenRequest = useMemo(() => {
    const ids = new Set<string>();
    for (const r of requests) {
      if (r.status !== "pago") ids.add(r.sale_id);
    }
    for (const n of nfs) {
      if (n.status !== "cancelada") ids.add(n.sale_id);
    }
    return ids;
  }, [requests, nfs]);

  // Vendas elegíveis a solicitar pagamento (têm saldo a receber e status permite).
  // Permanecem sempre visíveis na tela mesmo fora do período selecionado,
  // para o corretor não precisar voltar meses para encontrá-las.
  const eligibleSaleIds = useMemo(() => {
    const ids = new Set<string>();
    const paidMap = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "pago") {
        paidMap.set(r.sale_id, (paidMap.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
      }
    }
    for (const n of nfs) {
      if (n.status === "paga") {
        paidMap.set(n.sale_id, (paidMap.get(n.sale_id) ?? 0) + (Number((n as { valor_nf?: number | null }).valor_nf) || 0));
      }
    }
    for (const s of allSales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO") continue;
      const comLiq = Number(s.comissao_liq_corretor) || 0;
      const pago = paidMap.get(s.id) ?? 0;
      const aReceber = Math.round((comLiq - pago) * 100) / 100;
      if (aReceber > 0) ids.add(s.id);
    }
    return ids;
  }, [allSales, requests, nfs]);

  // aplica filtros (período + cliente)
  const sales = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const seen = new Set<string>();
    return allSales.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      const hasOpen = salesWithOpenRequest.has(s.id);
      const isEligible = eligibleSaleIds.has(s.id);
      const d = (s.data ?? "").slice(0, 10);
      // Período só filtra quando não há pedido em aberto e a venda
      // não está elegível para solicitar pagamento.
      if (!hasOpen && !isEligible) {
        if (dateFrom && d && d < dateFrom) return false;
        if (dateTo && d && d > dateTo) return false;
      }
      if (q && !(s.comprador ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo, clientSearch, salesWithOpenRequest, eligibleSaleIds]);

  // Mapa de adiantamentos/pagamentos por venda
  const paidBySale = useMemo(() => {
    const m = new Map<
      string,
      {
        adiantado: number;
        finalPago: number;
        items: Array<{ id: string; tipo: string; valor: number; data: string | null; kind: "request" | "nf" }>;
      }
    >();
    for (const r of requests) {
      if (r.status !== "pago") continue;
      if (((r as { requester_role?: string | null }).requester_role ?? "corretor") !== "corretor") continue;
      const cur = m.get(r.sale_id) ?? { adiantado: 0, finalPago: 0, items: [] };
      const v = Number(r.valor_solicitado) || 0;
      if (r.tipo === "adiantamento") cur.adiantado += v;
      else if (r.tipo === "comissao_final") cur.finalPago += v;
      cur.items.push({
        id: r.id,
        tipo: r.tipo,
        valor: v,
        data: (r.paid_at ?? r.decided_at ?? r.created_at) as string | null,
        kind: "request",
      });
      m.set(r.sale_id, cur);
    }
    // NFs pagas (fluxo iniciado pelo financeiro) também contam como comissão paga,
    // MAS apenas quando NÃO existe um commission_request pago para a mesma venda —
    // caso contrário, o valor seria contado em dobro (o pedido pago já representa o
    // desembolso ao corretor; a NF é apenas o documento fiscal).
    for (const n of nfs) {
      if (n.status !== "paga") continue;
      const v = Number((n as { valor_nf?: number | null }).valor_nf) || 0;
      if (v <= 0) continue;
      const cur = m.get(n.sale_id) ?? { adiantado: 0, finalPago: 0, items: [] };
      if (cur.adiantado > 0 || cur.finalPago > 0) continue; // já existe pedido pago → não duplica
      cur.finalPago += v;
      cur.items.push({
        id: n.id,
        tipo: "comissao_final",
        valor: v,
        data: (n.paga_at ?? n.recebida_at ?? n.created_at) as string | null,
        kind: "nf",
      });
      m.set(n.sale_id, cur);
    }


    return m;
  }, [requests, nfs]);

  // ---- Distratos do corretor ----
  const { data: distratosAll = [] } = useQuery({
    queryKey: ["distratos-broker", displayName],
    queryFn: () => fnDistratos({ data: {} }),
    enabled: !!displayName,
    refetchInterval: 15_000,
  });

  const distratos = useMemo(() => {
    if (!displayName) return [];
    // Para staff impersonando um corretor, filtrar pelo nome; corretor já vê só os seus pelo RLS.
    if (isStaff) {
      const dn = displayName.trim().toLowerCase();
      return distratosAll.filter((d) => (d.corretor_nome ?? "").trim().toLowerCase() === dn);
    }
    return distratosAll;
  }, [distratosAll, displayName, isStaff]);
  const distratoBySale = useMemo(() => {
    const m = new Map<string, (typeof distratos)[number]>();
    for (const d of distratos) if (d.status !== "cancelado") m.set(d.sale_id, d);
    return m;
  }, [distratos]);
  const totalADevolver = useMemo(
    () => distratos.filter((d) => d.status === "pendente_devolucao").reduce((s, d) => s + (Number(d.valor_devolver) || 0), 0),
    [distratos],
  );
  const totalDevolvido = useMemo(
    () => distratos.filter((d) => d.status === "devolvido").reduce((s, d) => s + (Number(d.valor_devolver) || 0), 0),
    [distratos],
  );

  const kpis = useMemo(() => {
    let total = 0;
    let adiantado = 0;
    let finalPago = 0;
    const saleIds = new Set(sales.map((s) => s.id));
    for (const s of sales) {
      total += Number(s.comissao_liq_corretor) || 0;
      const p = paidBySale.get(s.id);
      if (p) {
        // Adiantamentos só permanecem visíveis enquanto a comissão final
        // daquela venda ainda não foi paga.
        if (p.finalPago <= 0) adiantado += p.adiantado;
        finalPago += p.finalPago;
      }
    }
    const pagas = adiantado + finalPago;
    const aReceber = Math.max(0, total - pagas);
    const pendReq = requests.filter((r) => r.status === "pendente").length;

    // Valor solicitado em andamento (pendente OU aprovado aguardando pagamento)
    let valorSolicitado = 0;
    let emAndamentoCount = 0;
    for (const r of requests) {
      if (r.status !== "pendente" && r.status !== "aprovado") continue;
      if (!saleIds.has(r.sale_id)) continue;
      valorSolicitado += (Number(r.valor_solicitado) || 0) + (Number(r.bonus_corretor) || 0);
      emAndamentoCount += 1;
    }

    // Evolução mensal de solicitações: compara mês corrente x mês anterior
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    let curMonthValor = 0, prevMonthValor = 0, curMonthCount = 0, prevMonthCount = 0;
    for (const r of requests) {
      if (!r.created_at) continue;
      const k = String(r.created_at).slice(0, 7);
      const v = (Number(r.valor_solicitado) || 0) + (Number(r.bonus_corretor) || 0);
      if (k === curKey) { curMonthValor += v; curMonthCount += 1; }
      else if (k === prevKey) { prevMonthValor += v; prevMonthCount += 1; }
    }
    const evolucaoPct = prevMonthValor > 0
      ? ((curMonthValor - prevMonthValor) / prevMonthValor) * 100
      : (curMonthValor > 0 ? 100 : null);

    return { total, pagas, aReceber, adiantado, finalPago, pendReq, count: sales.length, valorSolicitado, emAndamentoCount, curMonthValor, prevMonthValor, curMonthCount, prevMonthCount, evolucaoPct };
  }, [sales, requests, paidBySale]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; vendas: number; comissao: number }>();
    for (const s of sales) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vendas: 0, comissao: 0 };
      cur.vendas += 1;
      cur.comissao += Number(s.comissao_liq_corretor) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [sales]);

  const requestsBySale = useMemo(() => {
    const m = new Map<string, typeof requests>();
    for (const r of requests) {
      const arr = m.get(r.sale_id) ?? [];
      arr.push(r);
      m.set(r.sale_id, arr);
    }
    return m;
  }, [requests]);


  const nfsBySale = useMemo(() => {
    const m = new Map<string, typeof nfs>();
    for (const n of nfs) {
      const arr = m.get(n.sale_id) ?? [];
      arr.push(n);
      m.set(n.sale_id, arr);
    }
    return m;
  }, [nfs]);

  // pedidos negados ainda relevantes (para banner de "leia o motivo")
  const deniedAlerts = useMemo(
    () => requests.filter((r) => r.status === "negado" && r.motivo_negacao),
    [requests],
  );

  // ---- Diálogo de pedido
  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: (typeof sales)[number] | null }>({
    open: false,
    sale: null,
  });
  const [reqForm, setReqForm] = useState<{
    tipo: "adiantamento" | "comissao_final";
    valor_sinal: number | null;
    bonus_corretor: number | null;
    valor_solicitado: number | null;
    observacao: string;
  }>({
    tipo: "adiantamento",
    valor_sinal: null,
    bonus_corretor: null,
    valor_solicitado: null,
    observacao: "",
  });
  const [comprovanteSinal, setComprovanteSinal] = useState<File | null>(null);
  const openReq = (sale: (typeof sales)[number]) => {
    const sinalSheet = Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || null;
    setReqForm({ tipo: "adiantamento", valor_sinal: sinalSheet, bonus_corretor: null, valor_solicitado: null, observacao: "" });
    setComprovanteSinal(null);
    setReqDialog({ open: true, sale });
  };
  const createMut = useMutation({
    mutationFn: async () => {
      let comprovante: { file_base64: string; file_name: string; file_mime: string } | undefined;
      if (comprovanteSinal) {
        if (comprovanteSinal.size > 15 * 1024 * 1024) throw new Error("Comprovante muito grande (máx. 15 MB).");
        const base64 = await readFileB64(comprovanteSinal);
        comprovante = {
          file_base64: base64,
          file_name: comprovanteSinal.name,
          file_mime: comprovanteSinal.type || "application/octet-stream",
        };
      }
      return fnCreate({
        data: {
          sale_id: reqDialog.sale!.id,
          tipo: reqForm.tipo,
          valor_sinal: reqForm.valor_sinal ?? 0,
          bonus_corretor: reqForm.bonus_corretor ?? 0,
          valor_solicitado: reqForm.valor_solicitado ?? 0,
          observacao_corretor: reqForm.observacao || undefined,
          act_as_corretor: isStaff ? activeBrokerArg : undefined,
          comprovante_sinal: comprovante,
        },
      });
    },
    onSuccess: () => {
      toast.success(isStaff ? "Pedido de teste criado." : "Solicitação enviada ao financeiro.");
      setReqDialog({ open: false, sale: null });
      setComprovanteSinal(null);
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Diálogo NF
  const [nfDialog, setNfDialog] = useState<{ open: boolean; nfId: string | null; sale: typeof allSales[number] | null }>({ open: false, nfId: null, sale: null });
  const [nfForm, setNfForm] = useState({ numero_nf: "", observacao: "", valor_nf: 0 });
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [nfFile2, setNfFile2] = useState<File | null>(null);
  const [uploadingNF, setUploadingNF] = useState(false);
  const openNF = (nfId: string, sale: typeof allSales[number]) => {
    // Auto-preenche o valor da NF com a soma dos pedidos aprovados (aguardando pagamento)
    // desta venda, JÁ ABATENDO os descontos de distrato aplicados pelo financeiro.
    // O corretor não pode alterar este valor — o cálculo é fixado pelo financeiro.
    const aprovadoValor = requests
      .filter((r) => r.sale_id === sale.id && r.status === "aprovado")
      .reduce((s, r) => {
        const v = Number(r.valor_solicitado) || 0;
        const desc = Number((r as { desconto_distrato?: number }).desconto_distrato) || 0;
        return s + Math.max(0, v - desc);
      }, 0);
    setNfForm({ numero_nf: "", observacao: "", valor_nf: aprovadoValor });
    setNfFile(null);
    setNfFile2(null);
    setNfDialog({ open: true, nfId, sale });
  };


  const readFileB64 = (f: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(f);
  });
  const emitMut = useMutation({
    mutationFn: async () => {
      if (!nfFile) throw new Error("Anexe o arquivo da NF (PDF, PNG ou JPEG).");
      if (nfFile.size > 15 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. 15 MB).");
      if (nfFile2 && nfFile2.size > 15 * 1024 * 1024) throw new Error("2º arquivo muito grande (máx. 15 MB).");
      setUploadingNF(true);
      try {
        const base64 = await readFileB64(nfFile);
        const file2 = nfFile2
          ? {
              file_base64: await readFileB64(nfFile2),
              file_name: nfFile2.name,
              file_mime: nfFile2.type || "application/octet-stream",
            }
          : undefined;
        return fnEmit({
          data: {
            id: nfDialog.nfId!,
            numero_nf: nfForm.numero_nf.trim(),
            valor_nf: nfForm.valor_nf,
            file_base64: base64,
            file_name: nfFile.name,
            file_mime: nfFile.type || "application/octet-stream",
            observacao: nfForm.observacao || undefined,
            file2,
          },
        });
      } finally {
        setUploadingNF(false);
      }
    },

    onSuccess: () => {
      toast.success("NF enviada com sucesso.");
      setNfDialog({ open: false, nfId: null, sale: null });
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const delReqMut = useMutation({
    mutationFn: (id: string) => fnDelReq({ data: { id } }),
    onSuccess: () => { toast.success("Solicitação excluída."); qc.invalidateQueries({ queryKey: ["my-broker-sales"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delNFMut = useMutation({
    mutationFn: (id: string) => fnDelNF({ data: { id } }),
    onSuccess: () => { toast.success("NF excluída."); qc.invalidateQueries({ queryKey: ["my-broker-sales"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const payMut = useMutation({
    mutationFn: (id: string) => fnPaid({ data: { id } }),
    onSuccess: () => { toast.success("Pagamento confirmado. Processo finalizado."); qc.invalidateQueries({ queryKey: ["my-broker-sales"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const payNFMut = useMutation({
    mutationFn: (id: string) => fnPayNF({ data: { id } }),
    onSuccess: () => { toast.success("NF marcada como paga. Processo finalizado."); qc.invalidateQueries({ queryKey: ["my-broker-sales"] }); },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Painel do Corretor</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Comissões</h1>
          {displayName && (
            <p className="text-sm text-muted-foreground mt-1">
              Visualizando: <span className="text-foreground font-medium">{displayName}</span>
            </p>
          )}
        </div>
        {isStaff && (
          <div className="w-full md:w-72">
            <Label className="text-xs">Ver como corretor</Label>
            <Select value={staffSelectedBroker ?? ""} onValueChange={(v) => setStaffSelectedBroker(v || undefined)}>
              <SelectTrigger><SelectValue placeholder="Selecione um corretor" /></SelectTrigger>
              <SelectContent>
                {brokers.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!displayName && !isLoading && (
        <div className="glass-card p-6 text-sm text-muted-foreground">
          {isStaff
            ? "Selecione um corretor acima."
            : "Sua conta ainda não está vinculada a um corretor na planilha. Solicite ao administrador o vínculo em Administração → Usuários."}
        </div>
      )}

      {displayName && (
        <>
          {(() => {
            const salesById = new Map(allSales.map((s) => [s.id, s]));
            const pending: PendingNFItem[] = nfs
              .filter((n) => n.status === "solicitada")
              .map((n) => {
                const s = salesById.get(n.sale_id);
                return {
                  id: n.id,
                  valor_nf: (n as { valor_nf?: number | null }).valor_nf ?? null,
                  sale_id: n.sale_id,
                  sale: s
                    ? { comprador: s.comprador, empreendimento: s.empreendimento, unidade: s.unidade, data: s.data }
                    : null,
                };
              });
            return pending.length > 0 ? (
              <GroupedNFEmitter
                items={pending}
                role="corretor"
                invalidateKeys={[["my-broker-sales", activeBrokerArg ?? myName ?? ""]]}
              />
            ) : null;
          })()}
          {/* Filtros */}



          <div className="glass-card p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Cliente</Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Digite o nome do comprador…" className="pl-9" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>{kpis.count} venda(s) no período</span>
              <button
                className="underline hover:text-foreground"
                onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(lastDayOfMonth()); setClientSearch(""); }}
              >
                Restaurar mês atual
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${totalADevolver > 0 ? "xl:grid-cols-8" : "xl:grid-cols-7"}`}>
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Comissão Total" value={BRL(kpis.total)} />
            <Kpi icon={<Wallet className="w-4 h-4" />} label="Adiantamentos" value={BRL(kpis.adiantado)} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Recebidos" value={BRL(kpis.pagas)} />
            <Kpi icon={<Clock className="w-4 h-4" />} label="A Receber" value={BRL(kpis.aReceber)} accent />
            <Kpi
              icon={<Send className="w-4 h-4" />}
              label="Valor Solicitado"
              value={BRL(kpis.valorSolicitado)}
              warn
              hint={kpis.pendReq > 0 ? `${kpis.pendReq} solicitação(ões) pendente(s)` : "Nenhuma pendente"}
            />
            {totalADevolver > 0 && (
              <Kpi icon={<Ban className="w-4 h-4" />} label="A Devolver (distrato)" value={BRL(totalADevolver)} danger />
            )}
            <Kpi icon={<FileText className="w-4 h-4" />} label="Vendas / Pendentes" value={`${kpis.count} / ${kpis.pendReq}`} />
            <Kpi
              icon={<Timer className="w-4 h-4" />}
              label="Evolução mensal"
              value={kpis.evolucaoPct == null ? "—" : `${kpis.evolucaoPct >= 0 ? "+" : ""}${kpis.evolucaoPct.toFixed(1)}%`}
              premium
              hint={
                kpis.evolucaoPct == null
                  ? "Sem solicitações nos últimos meses"
                  : `${BRL(kpis.curMonthValor)} este mês vs ${BRL(kpis.prevMonthValor)} no anterior`
              }
            />
          </div>




          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Comissão por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="comBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.78 0.16 180)" stopOpacity={1} />
                        <stop offset="100%" stopColor="oklch(0.55 0.14 200)" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => BRL(v)}
                      cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                      contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="comissao" fill="url(#comBarGrad)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Vendas por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vendasLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="oklch(0.78 0.16 180)" />
                        <stop offset="100%" stopColor="oklch(0.78 0.14 90)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="vendas" stroke="url(#vendasLineGrad)" strokeWidth={2.5} dot={{ r: 3, fill: "oklch(0.78 0.16 180)" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="glass-card p-2 overflow-x-auto">
            <table className="w-full text-sm min-w-[1040px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Comprador</th>
                  <th className="text-left p-3">Empreend. / Un.</th>
                  <th className="text-right p-3">Venda</th>
                  <th className="text-right p-3">Comissão Liq.</th>
                  <th className="text-right p-3">Adiantado</th>
                  <th className="text-right p-3">A Receber</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Pedidos / NF</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  </td></tr>
                )}
                {!isLoading && sales.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhuma venda encontrada no período/filtro.</td></tr>
                )}
                {sales.map((s) => {
                  const reqs = requestsBySale.get(s.id) ?? [];
                  const sNfs = nfsBySale.get(s.id) ?? [];
                  const hasPending = reqs.some((r) => r.status === "pendente" && (((r as { requester_role?: string | null }).requester_role ?? "corretor") === "corretor"));
                  const nfAberta = sNfs.find((n) => n.status === "solicitada" || n.status === "emitida");
                  const paid = paidBySale.get(s.id);
                  const distrato = distratoBySale.get(s.id);
                  const comissaoLiq = Number(s.comissao_liq_corretor) || 0;
                  const adiantadoSale = paid?.adiantado ?? 0;
                  const finalPagoSale = paid?.finalPago ?? 0;
                  const totalPagoSale = adiantadoSale + finalPagoSale;
                  const aReceberSale = Math.max(0, money(comissaoLiq - totalPagoSale));
                  // Quando o saldo exibido em "A Receber" zera, o processo fica finalizado e não abre nova solicitação.
                  const isFinalizada = aReceberSale <= 0;
                  // Pagamento antecipado: 100% pago e a venda está como "Caixa"
                  // (corretor recebeu adiantamento antes de a venda virar Caixa).
                  const isPagoAntecipado = isFinalizada && (s.status ?? "").trim().toUpperCase() === "CAIXA";
                  const historico = (paid?.items ?? []).slice().sort((a, b) =>
                    (b.data ?? "").localeCompare(a.data ?? ""),
                  );
                  const d10 = (s.data ?? "").slice(0, 10);
                  const isOutOfPeriod = !!d10 && ((dateFrom && d10 < dateFrom) || (dateTo && d10 > dateTo));
                  return (
                    <tr key={s.id} className={`border-t border-border align-top ${distrato && distrato.status === "pendente_devolucao" ? "bg-destructive/5" : isOutOfPeriod ? "bg-primary/[0.04]" : ""}`}>
                      <td className="p-3 whitespace-nowrap">
                        <div>{fmtBR(s.data)}</div>
                        {isOutOfPeriod && (
                          <Badge variant="outline" className="mt-1 text-[10px] gap-1 border-primary/40 text-primary bg-primary/10">
                            Fora do período
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        <div>{s.comprador ?? "—"}</div>
                        {distrato && (
                          <div className="mt-1 flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] gap-1 ${distrato.status === "devolvido" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}
                            >
                              <Ban className="w-2.5 h-2.5" />
                              {distrato.status === "devolvido" ? "Distrato devolvido" : `Distrato · devolver ${BRL(distrato.valor_devolver)}`}
                            </Badge>
                            {distrato.motivo && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    title="Ver mensagem do distrato"
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-80 p-3 space-y-2">
                                  <div className="text-[10px] uppercase tracking-wide text-destructive">Motivo do distrato</div>
                                  <div className="text-sm whitespace-pre-wrap break-words text-foreground/90 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                                    {distrato.motivo}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    Valor a devolver: <span className="font-semibold text-destructive">{BRL(distrato.valor_devolver)}</span>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <div>{s.empreendimento ?? "—"}</div>
                        <div className="text-xs">Unid: {s.unidade ?? "—"}</div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">{BRL(s.valor_venda)}</td>
                      <td className="p-3 text-right whitespace-nowrap font-medium">{BRL(comissaoLiq)}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={adiantadoSale > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                            {BRL(adiantadoSale)}
                          </span>
                          {historico.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  title="Ver histórico de pagamentos"
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                  <Clock className="w-3 h-3" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-80 p-3 space-y-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Histórico de pagamentos
                                </div>
                                <ul className="space-y-1.5 text-sm">
                                  {historico.map((h) => (
                                    <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                                      <div className="flex flex-col">
                                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                          {h.tipo === "adiantamento" ? "Adiantamento" : "Comissão final"}
                                          <span className="ml-1 text-[10px] text-muted-foreground/70">({h.kind === "nf" ? "NF" : "Pedido"})</span>
                                        </span>
                                        <span className="text-xs text-muted-foreground">{fmtBR(h.data)}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{BRL(h.valor)}</span>
                                        {isAdmin && (
                                          <button
                                            title="Excluir lançamento (admin) — remove o pagamento do histórico"
                                            onClick={() => {
                                              const label = h.tipo === "adiantamento" ? "adiantamento" : "comissão final";
                                              if (confirm(`Excluir este pagamento (${label} — ${BRL(h.valor)}) do histórico? Esta ação não pode ser desfeita.`)) {
                                                if (h.kind === "nf") delNFMut.mutate(h.id);
                                                else delReqMut.mutate(h.id);
                                              }
                                            }}
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </li>
                                  ))}

                                </ul>
                                <div className="pt-2 border-t border-border/60 text-xs space-y-0.5">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Adiantado</span><span>{BRL(adiantadoSale)}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Comissão final paga</span><span>{BRL(finalPagoSale)}</span></div>
                                  <div className="flex justify-between font-semibold text-primary"><span>Saldo a receber</span><span>{BRL(aReceberSale)}</span></div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {isFinalizada ? (
                          isPagoAntecipado ? (
                            <span
                              className="inline-flex items-center gap-1 text-sky-400 font-semibold"
                              title="Comissão integralmente paga antes de a venda virar Caixa."
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />Pago antecipadamente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />100% pago
                            </span>
                          )
                        ) : (
                          <span className={aReceberSale > 0 ? "text-primary font-semibold" : "text-muted-foreground"}>
                            {BRL(aReceberSale)}
                          </span>
                        )}
                      </td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{s.status ?? "—"}</Badge></td>


                      <td className="p-3">
                        <div className="space-y-1">
                          {/* (removido) badge "A receber" no painel do corretor */}

                          {reqs.map((r) => (
                            <div key={r.id} className="flex items-center gap-1 flex-wrap">
                              <RequestPill r={r} descontos={descontosByRequest.get(r.id) ?? []} />

                              {r.status === "negado" && r.motivo_negacao && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      title="Ver motivo da negação"
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                    >
                                      <MessageSquareWarning className="w-3 h-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="w-72 p-3 space-y-2">
                                    <div className="flex items-center gap-1.5 text-destructive text-xs font-semibold uppercase tracking-wide">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      Motivo da negação
                                    </div>
                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                                      {r.motivo_negacao}
                                    </p>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {(r.observacao_financeiro || r.observacao_corretor) && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      title="Ver mensagens"
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="w-80 p-3 space-y-2">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Mensagens do pedido
                                    </div>
                                    {r.observacao_corretor && (
                                      <div className="rounded-md border border-border/60 bg-secondary/40 p-2">
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Você (corretor)</div>
                                        <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{r.observacao_corretor}</div>
                                      </div>
                                    )}
                                    {r.observacao_financeiro && (
                                      <div className="rounded-md border border-primary/30 bg-primary/10 p-2">
                                        <div className="text-[10px] uppercase tracking-wide text-primary mb-0.5">Financeiro</div>
                                        <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{r.observacao_financeiro}</div>
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              )}
                              {isAdmin && (
                                <button title="Excluir (admin)" onClick={() => {
                                  if (confirm("Excluir esta solicitação?")) delReqMut.mutate(r.id);
                                }} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}

                          {sNfs.map((n) => (
                            <div key={n.id} className="flex items-center gap-1 flex-wrap">
                              <NFPill n={n} />
                              {(() => {
                                const nn = n as { observacao_financeiro?: string | null; observacao_corretor?: string | null; observacao_recebimento?: string | null; observacao_distrato?: string | null };
                                const hasMsg = nn.observacao_financeiro || nn.observacao_corretor || nn.observacao_recebimento || nn.observacao_distrato;
                                if (!hasMsg) return null;
                                return (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        title="Ver mensagens"
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      >
                                        <MessageSquare className="w-3 h-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-80 p-3 space-y-2">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens da NF</div>
                                      {nn.observacao_corretor && (
                                        <div className="rounded-md border border-border/60 bg-secondary/40 p-2">
                                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Você (corretor)</div>
                                          <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{nn.observacao_corretor}</div>
                                        </div>
                                      )}
                                      {nn.observacao_financeiro && (
                                        <div className="rounded-md border border-primary/30 bg-primary/10 p-2">
                                          <div className="text-[10px] uppercase tracking-wide text-primary mb-0.5">Financeiro</div>
                                          <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{nn.observacao_financeiro}</div>
                                        </div>
                                      )}
                                      {nn.observacao_distrato && (
                                        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2">
                                          <div className="text-[10px] uppercase tracking-wide text-rose-300 mb-0.5">Desconto distrato</div>
                                          <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{nn.observacao_distrato}</div>
                                        </div>
                                      )}
                                      {nn.observacao_recebimento && (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
                                          <div className="text-[10px] uppercase tracking-wide text-emerald-300 mb-0.5">Recebimento</div>
                                          <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{nn.observacao_recebimento}</div>
                                        </div>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                );
                              })()}
                              {n.status === "recebida" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={payNFMut.isPending}
                                  onClick={() => {
                                    if (confirm("Confirmar que o pagamento foi recebido? Isso finaliza o processo.")) {
                                      payNFMut.mutate(n.id);
                                    }
                                  }}
                                >
                                  <Wallet className="w-3 h-3 mr-1" />Pago
                                </Button>
                              )}
                              {isAdmin && (
                                <button title="Excluir NF (admin)" onClick={() => {
                                  if (confirm("Excluir esta NF?")) delNFMut.mutate(n.id);
                                }} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}

                          {reqs.length === 0 && sNfs.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1.5">
                          {isFinalizada ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 ${isPagoAntecipado ? "text-sky-400" : "text-emerald-400"}`}
                              title={isPagoAntecipado ? "Comissão integralmente paga antes de a venda virar Caixa." : undefined}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isPagoAntecipado ? "Pago antecipadamente" : "Finalizado"}
                            </span>
                          ) : (
                            (() => {
                              const stUp = (s.status ?? "").trim().toUpperCase();
                              const isReservado = stUp === "RESERVADO";
                              const isAssinado = stUp === "ASSINADO";
                              const isCaixa = stUp === "CAIXA";
                              const finSolicitou = !!nfAberta;
                              const jaTevePagamento = totalPagoSale > 0;
                              const sinalSale = Number((s as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
                              const sinalOk = sinalSale >= 2999.99;
                              // Regra: ASSINADO só libera se sinal ≥ R$ 2.999,99. CAIXA/NF liberam sempre.
                              const allowed =
                                !isReservado &&
                                !hasPending &&
                                (isCaixa || finSolicitou || (isAssinado && !jaTevePagamento && sinalOk));
                              const label = isReservado
                                ? "Reservado"
                                : hasPending
                                  ? "Pendente"
                                  : isCaixa || finSolicitou
                                    ? "Solicitar pagamento"
                                    : jaTevePagamento
                                      ? "Aguardando CAIXA"
                                      : isAssinado && sinalOk
                                        ? "Solicitar adiantamento"
                                        : isAssinado && !sinalOk
                                          ? "Sinal insuficiente"
                                          : "Aguardando CAIXA";
                              const blockReason = isReservado
                                ? "Venda reservada não permite solicitação."
                                : hasPending
                                  ? "Já existe uma solicitação pendente para esta venda."
                                  : isAssinado && !sinalOk && !jaTevePagamento
                                    ? `Sinal de ${BRL(sinalSale)} é menor que R$ 2.999,99 — adiantamento não liberado. Aguarde o status virar CAIXA.`
                                    : !allowed
                                      ? "Aguardando o Status da venda virar CAIXA (ou o financeiro solicitar a NF) para liberar nova solicitação."
                                      : "";
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!allowed}
                                  title={blockReason}
                                  onClick={() => openReq(s)}
                                >
                                  {label}
                                </Button>
                              );
                            })()




                          )}

                          {nfAberta && aReceberSale > 0 && (
                            <Button size="sm" onClick={() => openNF(nfAberta.id, s)}
                              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                              Enviar NF
                            </Button>

                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* DIALOG: Solicitar */}
      <Dialog open={reqDialog.open} onOpenChange={(o) => setReqDialog({ open: o, sale: o ? reqDialog.sale : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar adiantamento / comissão</DialogTitle>
            <DialogDescription>
              {reqDialog.sale && (
                <>Venda: <b>{reqDialog.sale.comprador}</b> · {reqDialog.sale.empreendimento} / {reqDialog.sale.unidade} · {fmtBR(reqDialog.sale.data)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sale = reqDialog.sale;
            const comLiq = Number(sale?.comissao_liq_corretor) || 0;
            const valorVenda = Number(sale?.valor_venda) || 0;
            const statusUp = (sale?.status ?? "").trim().toUpperCase();
            const paidS = sale ? paidBySale.get(sale.id) : undefined;
            const jaAdiantado = paidS?.adiantado ?? 0;
            const jaFinal = paidS?.finalPago ?? 0;
            const maxReceber = Math.max(0, comLiq - jaAdiantado - jaFinal);
            const valor = reqForm.valor_solicitado ?? 0;
            const sinal = reqForm.valor_sinal ?? 0;
            const excedeu = valor > maxReceber + 0.01;
            // Regras automáticas
            const minSinalComissao = valorVenda * 0.06;
            const maxAdiant = Math.floor(sinal / 2999.99) * 1000;
            const isCaixa = statusUp === "CAIXA";
            const isReservado = statusUp === "RESERVADO";
            const ruleAdiantOk = isCaixa || reqForm.tipo !== "adiantamento" || (sinal >= 2999.99 && valor <= maxAdiant);
            const ruleComissaoOk = isCaixa || reqForm.tipo !== "comissao_final" || valorVenda === 0 || sinal >= minSinalComissao;
            const ruleViolated = isReservado || !ruleAdiantOk || !ruleComissaoOk;
            return (
              <>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs grid grid-cols-3 gap-2">
                    <div><div className="text-muted-foreground">Comissão Liq.</div><div className="font-semibold">{BRL(comLiq)}</div></div>
                    <div><div className="text-muted-foreground">Já adiantado</div><div className={`font-semibold ${jaAdiantado > 0 ? "text-amber-400" : ""}`}>{BRL(jaAdiantado)}</div></div>
                    <div><div className="text-muted-foreground">Máx. a solicitar</div><div className="font-semibold text-primary">{BRL(maxReceber)}</div></div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs space-y-1">
                    <div className="font-semibold text-foreground">Regras por status da venda</div>
                    {isReservado && (
                      <div className="text-destructive">• <b>Reservado:</b> nenhuma solicitação permitida até a assinatura.</div>
                    )}
                    {isCaixa && (
                      <div className="text-emerald-400">• <b>Caixa:</b> liberado solicitar a comissão integral, sem exigência de sinal.</div>
                    )}
                    {!isReservado && !isCaixa && (
                      <>
                        <div className="text-muted-foreground">• <b>Assinado:</b> adiantamento exige <b>R$ 2.999,99</b> de sinal a cada <b>R$ 1.000</b>.</div>
                        <div className="text-muted-foreground">• Comissão final exige sinal ≥ <b>6%</b> da venda{valorVenda > 0 ? <> (mín. <b>{BRL(minSinalComissao)}</b>)</> : null}.</div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={reqForm.tipo} onValueChange={(v) => setReqForm({ ...reqForm, tipo: v as typeof reqForm.tipo })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adiantamento">Adiantamento</SelectItem>
                          <SelectItem value="comissao_final">Comissão final</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor solicitado (R$)</Label>
                      <CurrencyInput value={reqForm.valor_solicitado} onValueChange={(v) => setReqForm({ ...reqForm, valor_solicitado: v })} />
                      {excedeu && (
                        <p className="text-xs text-destructive">Valor excede o saldo a receber ({BRL(maxReceber)}).</p>
                      )}
                      {!excedeu && valor > 0 && (
                        <p className="text-xs text-muted-foreground">Restante após este pedido: {BRL(maxReceber - valor)}</p>
                      )}
                      {reqForm.tipo === "adiantamento" && sinal >= 2999.99 && valor > maxAdiant && (
                        <p className="text-xs text-destructive">Adiantamento máximo permitido: {BRL(maxAdiant)} (R$ 1.000 a cada R$ 2.999,99 de sinal).</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Sinal recebido (R$)</Label>
                      <CurrencyInput
                        value={reqForm.valor_sinal}
                        onValueChange={(v) => setReqForm({ ...reqForm, valor_sinal: v })}
                        disabled={Number((sale as { valor_sinal_negocio?: number | null })?.valor_sinal_negocio) > 0 || statusUp === "CAIXA"}
                      />
                      {(() => {
                        const sheetSinal = Number((sale as { valor_sinal_negocio?: number | null })?.valor_sinal_negocio) || 0;
                        const needsComprovante = sheetSinal <= 0 && statusUp !== "CAIXA";
                        if (!needsComprovante) return null;
                        return (
                          <div className="mt-1">
                            <label
                              htmlFor="comprovante-sinal"
                              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border cursor-pointer transition ${
                                comprovanteSinal
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                              }`}
                              title="O sinal não consta na planilha — anexe o comprovante (obrigatório)"
                            >
                              <Paperclip className="w-3 h-3" />
                              {comprovanteSinal ? (
                                <span className="truncate max-w-[160px]">{comprovanteSinal.name}</span>
                              ) : (
                                <span>Anexar comprovante de sinal *</span>
                              )}
                            </label>
                            {comprovanteSinal && (
                              <button
                                type="button"
                                className="ml-1 inline-flex items-center text-[11px] text-muted-foreground hover:text-destructive"
                                onClick={() => setComprovanteSinal(null)}
                                title="Remover"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                            <input
                              id="comprovante-sinal"
                              type="file"
                              className="hidden"
                              accept="image/*,application/pdf"
                              onChange={(e) => setComprovanteSinal(e.target.files?.[0] ?? null)}
                            />
                            {!comprovanteSinal && (
                              <p className="mt-1 text-[10px] text-amber-300/80">
                                Obrigatório: sem comprovante, a solicitação não é enviada.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {statusUp !== "CAIXA" && reqForm.tipo === "adiantamento" && sinal > 0 && sinal < 2999.99 && (
                        <p className="text-xs text-destructive">Sinal precisa ser ≥ R$ 2.999,99 para liberar adiantamento.</p>
                      )}
                      {statusUp !== "CAIXA" && reqForm.tipo === "comissao_final" && valorVenda > 0 && sinal > 0 && sinal < minSinalComissao && (
                        <p className="text-xs text-destructive">Sinal abaixo de 6% do valor da venda (mín. {BRL(minSinalComissao)}).</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Bônus corretor (R$)</Label>
                      <CurrencyInput value={reqForm.bonus_corretor} onValueChange={(v) => setReqForm({ ...reqForm, bonus_corretor: v })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações</Label>
                    <Textarea value={reqForm.observacao} onChange={(e) => setReqForm({ ...reqForm, observacao: e.target.value })} rows={3} maxLength={2000} placeholder="Detalhes para o financeiro…" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setReqDialog({ open: false, sale: null })}>Cancelar</Button>
                  {(() => {
                    const sheetSinal = Number((sale as { valor_sinal_negocio?: number | null })?.valor_sinal_negocio) || 0;
                    const needsComprovante = sheetSinal <= 0 && statusUp !== "CAIXA";
                    const missingComprovante = needsComprovante && !comprovanteSinal;
                    return (
                      <Button
                        disabled={createMut.isPending || !reqForm.valor_solicitado || excedeu || ruleViolated || missingComprovante}
                        onClick={() => createMut.mutate()}
                        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                        title={missingComprovante ? "Anexe o comprovante de sinal para enviar" : undefined}
                      >
                        {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar pedido"}
                      </Button>
                    );
                  })()}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* DIALOG: Enviar NF */}
      <Dialog open={nfDialog.open} onOpenChange={(o) => setNfDialog({ open: o, nfId: o ? nfDialog.nfId : null, sale: o ? nfDialog.sale : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Nota Fiscal</DialogTitle>
            <DialogDescription>
              {nfDialog.sale && (
                <>Venda: <b>{nfDialog.sale.comprador}</b> · {nfDialog.sale.empreendimento} / {nfDialog.sale.unidade} · {fmtBR(nfDialog.sale.data)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sale = nfDialog.sale;
            const comLiq = Number(sale?.comissao_liq_corretor) || 0;
            const paidS = sale ? paidBySale.get(sale.id) : undefined;
            const jaAdiantado = paidS?.adiantado ?? 0;
            const jaFinal = paidS?.finalPago ?? 0;
            // Descontos de distrato aplicados pelo financeiro sobre pedidos APROVADOS desta venda
            const aprovDaVenda = sale ? requests.filter((r) => r.sale_id === sale.id && r.status === "aprovado") : [];
            const descontoTotal = aprovDaVenda.reduce(
              (s, r) => s + (Number((r as { desconto_distrato?: number }).desconto_distrato) || 0),
              0,
            );
            const valorBruto = aprovDaVenda.reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
            const aReceber = Math.max(0, comLiq - jaAdiantado - jaFinal);
            const valor = nfForm.valor_nf ?? 0;
            const excedeu = valor > aReceber + 0.001;
            const temDesconto = descontoTotal > 0;
            return (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs grid grid-cols-3 gap-2">
                  <div><div className="text-muted-foreground">Comissão Liq.</div><div className="font-semibold">{BRL(comLiq)}</div></div>
                  <div><div className="text-muted-foreground">Já pago</div><div className={`font-semibold ${(jaAdiantado + jaFinal) > 0 ? "text-amber-400" : ""}`}>{BRL(jaAdiantado + jaFinal)}</div></div>
                  <div><div className="text-muted-foreground">A receber</div><div className="font-semibold text-primary">{BRL(aReceber)}</div></div>
                </div>

                {temDesconto && (
                  <div className="rounded-lg border border-violet-400/40 bg-violet-500/10 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-violet-300">
                      <Ban className="w-3.5 h-3.5" /> Desconto de distrato aplicado pelo financeiro
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Pedido aprovado</div>
                        <div className="font-semibold">{BRL(valorBruto)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Desconto</div>
                        <div className="font-semibold text-rose-300">− {BRL(descontoTotal)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Líquido (NF)</div>
                        <div className="font-semibold text-emerald-300">{BRL(Math.max(0, valorBruto - descontoTotal))}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-violet-200/80 pt-1">
                      O valor da NF foi recalculado automaticamente com o desconto e <b>não pode ser alterado</b>.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Número da NF *</Label>
                    <Input value={nfForm.numero_nf} onChange={(e) => setNfForm({ ...nfForm, numero_nf: e.target.value })} maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor da NF (R$) *{temDesconto && <span className="ml-1 text-[10px] text-violet-300">(fixado pelo financeiro)</span>}</Label>
                    <CurrencyInput
                      value={nfForm.valor_nf}
                      onValueChange={(v) => setNfForm({ ...nfForm, valor_nf: v ?? 0 })}
                      disabled={temDesconto}
                    />
                    {excedeu && (
                      <p className="text-xs text-destructive">Valor excede o saldo a receber ({BRL(aReceber)}).</p>
                    )}

                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Anexos</span>
                    <span className="text-[11px] text-muted-foreground">{(nfFile ? 1 : 0) + (nfFile2 ? 1 : 0)}/2 · máx 15MB</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "nf", file: nfFile, setFile: setNfFile, label: "Nota Fiscal", required: true },
                      { key: "pr", file: nfFile2, setFile: setNfFile2, label: "Promissória", required: false },
                    ] as const).map((slot) => {
                      const has = !!slot.file;
                      return (
                        <label
                          key={slot.key}
                          className={`group relative cursor-pointer rounded-md border px-3 py-2.5 transition-all flex items-center gap-2.5 ${
                            has
                              ? "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/15"
                              : slot.required
                                ? "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60"
                                : "border-border/60 bg-background/40 hover:bg-background/70"
                          }`}
                        >
                          <input
                            type="file"
                            className="sr-only"
                            accept=".pdf,.xml,application/pdf,text/xml,application/xml,image/*"
                            onChange={(e) => slot.setFile(e.target.files?.[0] ?? null)}
                          />
                          <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${has ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary/60 text-muted-foreground group-hover:text-foreground"}`}>
                            {has ? <CheckCircle2 className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium flex items-center gap-1">
                              {slot.label}
                              {slot.required && <span className="text-primary">*</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {has ? `${slot.file!.name} · ${(slot.file!.size / 1024).toFixed(0)} KB` : "Clique para anexar"}
                            </div>
                          </div>
                          {has && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); slot.setFile(null); }}
                              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              aria-label="Remover"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea
                    value={nfForm.observacao}
                    onChange={(e) => setNfForm({ ...nfForm, observacao: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder="Opcional — informações adicionais para o financeiro"
                  />
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setNfDialog({ open: false, nfId: null, sale: null })}>Cancelar</Button>
                  <Button
                    disabled={emitMut.isPending || uploadingNF || !nfForm.numero_nf.trim() || !nfFile || valor <= 0 || excedeu}
                    onClick={() => emitMut.mutate()}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    {emitMut.isPending || uploadingNF ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar NF"}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>


    </div>
  );
}

function Kpi({ icon, label, value, accent, danger, warn, premium, hint }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; danger?: boolean; warn?: boolean; premium?: boolean; hint?: string }) {
  const border = danger
    ? "border border-destructive/30"
    : premium
      ? "border border-amber-400/30 bg-gradient-to-br from-amber-500/[0.06] to-transparent relative overflow-hidden"
      : warn
        ? "border border-amber-500/30"
        : "";
  const valueColor = danger
    ? "text-destructive"
    : premium
      ? "text-amber-300"
      : warn
        ? "text-amber-400"
        : accent
          ? "text-primary"
          : "";
  const bgTint = danger
    ? "text-destructive/10"
    : premium
      ? "text-amber-300/10"
      : warn
        ? "text-amber-400/10"
        : accent
          ? "text-primary/10"
          : "text-foreground/[0.06]";
  return (
    <div className={`glass-card p-4 relative overflow-hidden ${border}`}>
      {premium && (
        <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-amber-400/10 blur-2xl" />
      )}
      <div className={`pointer-events-none absolute -bottom-4 -right-3 ${bgTint} transition-transform duration-500 group-hover:scale-110`}>
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-20 h-20" })
          : null}
      </div>
      <div className="relative flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
      <div className={`relative mt-2 font-display text-2xl font-semibold ${valueColor}`}>{value}</div>
      {hint && <div className="relative mt-1 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

function RequestPill({ r, descontos = [] }: { r: { id: string; tipo: string; valor_solicitado: number; status: string; motivo_negacao: string | null; desconto_distrato?: number | null }; descontos?: DescontoInfo[] }) {
  const map: Record<string, { c: string; i: React.ReactNode; l: string }> = {
    pendente: { c: "bg-amber-500/10 text-amber-500 border-amber-500/30", i: <Clock className="w-3 h-3" />, l: "Pendente" },
    aprovado: { c: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", i: <CheckCircle2 className="w-3 h-3" />, l: "Aprovado" },
    negado: { c: "bg-destructive/10 text-destructive border-destructive/30", i: <XCircle className="w-3 h-3" />, l: "Negado" },
    pago: { c: "bg-primary/10 text-primary border-primary/30", i: <Wallet className="w-3 h-3" />, l: "Pago" },
  };
  const s = map[r.status] ?? map.pendente;
  const desc = Number(r.desconto_distrato) || 0;
  const liquido = Math.max(0, Number(r.valor_solicitado) - desc);
  const ativos = descontos.filter((d) => d.status === "aplicado");
  const label = desc > 0 && (r.status === "aprovado" || r.status === "pago") ? `${s.l}/Reajustada` : s.l;
  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${s.c}`} title={r.motivo_negacao ?? undefined}>
        {s.i}<FileText className="w-3 h-3" /> {r.tipo === "adiantamento" ? "Adiant." : "Comiss."}: {BRL(r.valor_solicitado)} · {label}
      </div>
      {desc > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Ver detalhes do desconto de distrato"
              className="inline-flex items-center gap-1 text-[10px] rounded-md border border-violet-400/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition px-2 py-0.5 self-start"
            >
              <Ban className="w-2.5 h-2.5" /> Desc. distrato: {BRL(desc)} · Líq. {BRL(liquido)}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-violet-300 text-xs font-semibold uppercase tracking-wide">
              <Ban className="w-3.5 h-3.5" /> Desconto de distrato
            </div>
            <p className="text-[11px] text-muted-foreground">
              O financeiro vinculou este pedido a um distrato pendente. O valor abaixo será abatido do pagamento.
            </p>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-2 text-xs grid grid-cols-3 gap-2">
              <div><div className="text-[9px] uppercase text-muted-foreground">Pedido</div><div className="font-semibold">{BRL(r.valor_solicitado)}</div></div>
              <div><div className="text-[9px] uppercase text-muted-foreground">Desconto</div><div className="font-semibold text-rose-300">− {BRL(desc)}</div></div>
              <div><div className="text-[9px] uppercase text-muted-foreground">Líquido</div><div className="font-semibold text-emerald-300">{BRL(liquido)}</div></div>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto">
              {ativos.length === 0 && (
                <div className="text-[11px] text-muted-foreground italic">Detalhes do distrato não disponíveis.</div>
              )}
              {ativos.map((d) => (
                <div key={d.id} className="rounded-md border border-violet-400/30 bg-violet-500/5 p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-foreground truncate">{d.distrato?.comprador ?? "—"}</div>
                    <div className="font-semibold text-rose-300 whitespace-nowrap">{BRL(d.valor_desconto)}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.distrato?.empreendimento ?? "—"} / {d.distrato?.unidade ?? "—"}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 border-t border-border/40">
                    <div>
                      <div className="text-muted-foreground">Data da venda</div>
                      <div className="font-medium">{fmtBR(d.distrato?.data_venda)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Aplicado em</div>
                      <div className="font-medium">{d.aplicado_at ? new Date(d.aplicado_at).toLocaleDateString("pt-BR") : "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Adiant. pago</div>
                      <div className="font-medium">{BRL(d.distrato?.valor_adiantamento)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">A devolver</div>
                      <div className="font-medium text-destructive">{BRL(d.distrato?.valor_devolver)}</div>
                    </div>
                  </div>
                  {d.observacao && (
                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                      <b>Obs:</b> {d.observacao}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}


function NFPill({ n }: { n: { id: string; status: string; numero_nf: string | null } }) {
  const map: Record<string, string> = {
    solicitada: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    emitida: "bg-sky-500/10 text-sky-500 border-sky-500/30",
    recebida: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    paga: "bg-primary/10 text-primary border-primary/30",
    cancelada: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const label = n.status === "paga" ? "finalizado" : n.status;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${map[n.status] ?? ""}`}>
      <Receipt className="w-3 h-3" /> NF {n.numero_nf ? `#${n.numero_nf}` : ""} · {label}
    </div>
  );
}
