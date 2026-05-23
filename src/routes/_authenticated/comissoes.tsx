import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listMyBrokerSales, listDistinctCorretores } from "@/lib/commissions.functions";
import { createCommissionRequest, deleteCommissionRequest, markRequestPaid } from "@/lib/requests.functions";
import { markNFEmitted, deleteNFRequest, markNFPaid } from "@/lib/nf.functions";
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
import { Loader2, Wallet, TrendingUp, FileText, Receipt, CheckCircle2, Clock, XCircle, Search, Trash2, AlertTriangle, MessageSquareWarning, Ban } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: ComissoesPage,
  head: () => ({ meta: [{ title: "Comissões · Gestão Comercial" }] }),
});

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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


  const [staffSelectedBroker, setStaffSelectedBroker] = useState<string | undefined>(undefined);
  const activeBrokerArg = isStaff ? staffSelectedBroker : undefined;

  // ---- Filtros ----
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(lastDayOfMonth());
  const [clientSearch, setClientSearch] = useState<string>("");

  const { data: brokers = [] } = useQuery({
    queryKey: ["distinct-corretores"],
    queryFn: () => fnDistinct(),
    enabled: isStaff,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-broker-sales", activeBrokerArg ?? myName],
    queryFn: () => fnSales({ data: activeBrokerArg ? { corretorNome: activeBrokerArg } : undefined }),
  });

  const allSales = data?.sales ?? [];
  const requests = data?.requests ?? [];
  const nfs = data?.nfs ?? [];
  const displayName = data?.corretorNome ?? null;

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

  // aplica filtros (período + cliente)
  const sales = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const seen = new Set<string>();
    return allSales.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      const hasOpen = salesWithOpenRequest.has(s.id);
      const d = (s.data ?? "").slice(0, 10);
      // Período só filtra quando não há pedido em aberto.
      if (!hasOpen) {
        if (dateFrom && d && d < dateFrom) return false;
        if (dateTo && d && d > dateTo) return false;
      }
      if (q && !(s.comprador ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo, clientSearch, salesWithOpenRequest]);

  // Mapa de adiantamentos/pagamentos por venda
  const paidBySale = useMemo(() => {
    const m = new Map<
      string,
      {
        adiantado: number;
        finalPago: number;
        items: Array<{ id: string; tipo: string; valor: number; data: string | null }>;
      }
    >();
    for (const r of requests) {
      if (r.status !== "pago") continue;
      const cur = m.get(r.sale_id) ?? { adiantado: 0, finalPago: 0, items: [] };
      const v = Number(r.valor_solicitado) || 0;
      if (r.tipo === "adiantamento") cur.adiantado += v;
      else if (r.tipo === "comissao_final") cur.finalPago += v;
      cur.items.push({
        id: r.id,
        tipo: r.tipo,
        valor: v,
        data: (r.paid_at ?? r.decided_at ?? r.created_at) as string | null,
      });
      m.set(r.sale_id, cur);
    }
    return m;
  }, [requests]);

  // ---- Distratos do corretor ----
  const { data: distratosAll = [] } = useQuery({
    queryKey: ["distratos-broker", displayName],
    queryFn: () => fnDistratos({ data: {} }),
    enabled: !!displayName,
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
    for (const s of sales) {
      total += Number(s.comissao_liq_corretor) || 0;
      const p = paidBySale.get(s.id);
      if (p) {
        adiantado += p.adiantado;
        finalPago += p.finalPago;
      }
    }
    const pagas = adiantado + finalPago;
    const aReceber = Math.max(0, total - pagas);
    const pendReq = requests.filter((r) => r.status === "pendente").length;
    return { total, pagas, aReceber, adiantado, finalPago, pendReq, count: sales.length };
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
  const openReq = (sale: (typeof sales)[number]) => {
    const sinalSheet = Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || null;
    setReqForm({ tipo: "adiantamento", valor_sinal: sinalSheet, bonus_corretor: null, valor_solicitado: null, observacao: "" });
    setReqDialog({ open: true, sale });
  };
  const createMut = useMutation({
    mutationFn: () =>
      fnCreate({
        data: {
          sale_id: reqDialog.sale!.id,
          tipo: reqForm.tipo,
          valor_sinal: reqForm.valor_sinal ?? 0,
          bonus_corretor: reqForm.bonus_corretor ?? 0,
          valor_solicitado: reqForm.valor_solicitado ?? 0,
          observacao_corretor: reqForm.observacao || undefined,
          act_as_corretor: isStaff ? activeBrokerArg : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isStaff ? "Pedido de teste criado." : "Solicitação enviada ao financeiro.");
      setReqDialog({ open: false, sale: null });
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
    setNfForm({ numero_nf: "", observacao: "", valor_nf: 0 });
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
            file_base64: base64,
            file_name: nfFile.name,
            file_mime: nfFile.type || "application/octet-stream",
            observacao: [nfForm.valor_nf > 0 ? `Valor da NF: ${BRL(nfForm.valor_nf)}` : "", nfForm.observacao].filter(Boolean).join(" — ") || undefined,
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

          <div className={`grid grid-cols-2 gap-3 ${totalADevolver > 0 ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Comissão Total" value={BRL(kpis.total)} />
            <Kpi icon={<Wallet className="w-4 h-4" />} label="Adiantado" value={BRL(kpis.adiantado)} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Já Pago" value={BRL(kpis.pagas)} />
            <Kpi icon={<Clock className="w-4 h-4" />} label="A Receber" value={BRL(kpis.aReceber)} accent />
            {totalADevolver > 0 && (
              <Kpi icon={<Ban className="w-4 h-4" />} label="A Devolver (distrato)" value={BRL(totalADevolver)} danger />
            )}
            <Kpi icon={<FileText className="w-4 h-4" />} label="Vendas / Pendentes" value={`${kpis.count} / ${kpis.pendReq}`} />
          </div>

          {distratos.length > 0 && (
            <div className="rounded-full border border-destructive/30 bg-destructive/5 px-3 py-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 pr-2 border-r border-destructive/20">
                <Ban className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs font-medium">Distratos</span>
                <span className="text-[11px] text-muted-foreground">
                  Pend. <span className="text-destructive font-semibold">{BRL(totalADevolver)}</span>
                  {totalDevolvido > 0 && <> · Dev. <span className="text-emerald-400 font-semibold">{BRL(totalDevolvido)}</span></>}
                </span>
              </div>
              {distratos.map((d) => {
                const dot =
                  d.status === "devolvido" ? "bg-emerald-400"
                  : d.status === "cancelado" ? "bg-muted-foreground/50"
                  : "bg-destructive";
                const amountCls =
                  d.status === "devolvido" ? "text-emerald-400"
                  : d.status === "cancelado" ? "text-muted-foreground line-through"
                  : "text-destructive";
                return (
                  <span
                    key={d.id}
                    title={`${d.empreendimento ?? "—"} · Unid ${d.unidade ?? "—"}${d.motivo ? ` — ${d.motivo}` : ""}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-background/60 border border-border/60 px-2.5 py-1 text-[11px]"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className="font-medium truncate max-w-[140px]">{d.comprador ?? "—"}</span>
                    <span className={`font-semibold ${amountCls}`}>{BRL(d.valor_devolver)}</span>
                  </span>
                );
              })}
            </div>
          )}



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
                  const hasPending = reqs.some((r) => r.status === "pendente");
                  const nfAberta = sNfs.find((n) => n.status === "solicitada" || n.status === "emitida");
                  const paid = paidBySale.get(s.id);
                  const distrato = distratoBySale.get(s.id);
                  const comissaoLiq = Number(s.comissao_liq_corretor) || 0;
                  const adiantadoSale = paid?.adiantado ?? 0;
                  const finalPagoSale = paid?.finalPago ?? 0;
                  const totalPagoSale = adiantadoSale + finalPagoSale;
                  // Se há NF paga, considerar a comissão como totalmente quitada
                  // (cobre o caso em que financeiro pagou direto via NF sem pedido vinculado).
                  const hasNfPaga = sNfs.some((n) => n.status === "paga");
                  const aReceberSale = hasNfPaga ? 0 : Math.max(0, comissaoLiq - totalPagoSale);
                  const isFinalizada = comissaoLiq > 0 && (aReceberSale === 0 || hasNfPaga);
                  const historico = (paid?.items ?? []).slice().sort((a, b) =>
                    (b.data ?? "").localeCompare(a.data ?? ""),
                  );
                  return (
                    <tr key={s.id} className={`border-t border-border align-top ${distrato && distrato.status === "pendente_devolucao" ? "bg-destructive/5" : ""}`}>
                      <td className="p-3 whitespace-nowrap">{fmtBR(s.data)}</td>
                      <td className="p-3 font-medium">
                        <div>{s.comprador ?? "—"}</div>
                        {distrato && (
                          <Badge
                            variant="outline"
                            className={`mt-1 text-[10px] gap-1 ${distrato.status === "devolvido" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}
                            title={distrato.motivo ?? undefined}
                          >
                            <Ban className="w-2.5 h-2.5" />
                            {distrato.status === "devolvido" ? "Distrato devolvido" : `Distrato · devolver ${BRL(distrato.valor_devolver)}`}
                          </Badge>
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
                                    <li key={h.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                                      <div className="flex flex-col">
                                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                          {h.tipo === "adiantamento" ? "Adiantamento" : "Comissão final"}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{fmtBR(h.data)}</span>
                                      </div>
                                      <span className="font-medium">{BRL(h.valor)}</span>
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
                        {comissaoLiq > 0 && aReceberSale === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />100% pago
                          </span>
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

                          {(() => {
                            // Pago só pode ser marcado sob o valor solicitado
                            // depois que a NF foi enviada (recebida) ou já paga.
                            const nfEnviada = sNfs.find((n) => n.status === "recebida" || n.status === "paga");
                            return reqs.map((r) => (
                            <div key={r.id} className="flex items-center gap-1 flex-wrap">
                              <RequestPill r={r} />
                              {r.status !== "pago" && r.status !== "negado" && nfEnviada && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={payMut.isPending || payNFMut.isPending}
                                  onClick={() => {
                                    if (confirm("Confirmar que o pagamento foi recebido? Isso finaliza o processo.")) {
                                      payMut.mutate(r.id);
                                      if (nfEnviada.status === "recebida") payNFMut.mutate(nfEnviada.id);
                                    }
                                  }}
                                >
                                  <Wallet className="w-3 h-3 mr-1" />Pago
                                </Button>
                              )}



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
                              {isAdmin && (
                                <button title="Excluir (admin)" onClick={() => {
                                  if (confirm("Excluir esta solicitação?")) delReqMut.mutate(r.id);
                                }} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            ));
                          })()}

                          {sNfs.map((n) => (
                            <div key={n.id} className="flex items-center gap-1 flex-wrap">
                              <NFPill n={n} />
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
                          {comissaoLiq > 0 && aReceberSale === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold px-2 py-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />Finalizado
                            </span>
                          ) : (
                            (() => {
                              const stUp = (s.status ?? "").trim().toUpperCase();
                              const isReservado = stUp === "RESERVADO";
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={hasPending || isReservado}
                                  title={isReservado ? "Venda reservada não permite solicitação." : (hasPending ? "Já existe uma solicitação pendente para esta venda." : "")}
                                  onClick={() => openReq(s)}
                                >
                                  {isReservado ? "Reservado" : hasPending ? "Pendente" : "Solicitar pagamento"}
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
            const excedeu = valor > maxReceber;
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
                  <Button disabled={createMut.isPending || !reqForm.valor_solicitado || excedeu || ruleViolated} onClick={() => createMut.mutate()}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                    {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar pedido"}
                  </Button>
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
            const aReceber = Math.max(0, comLiq - jaAdiantado - jaFinal);
            const valor = nfForm.valor_nf ?? 0;
            const excedeu = valor > aReceber;
            return (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs grid grid-cols-3 gap-2">
                  <div><div className="text-muted-foreground">Comissão Liq.</div><div className="font-semibold">{BRL(comLiq)}</div></div>
                  <div><div className="text-muted-foreground">Já pago</div><div className={`font-semibold ${(jaAdiantado + jaFinal) > 0 ? "text-amber-400" : ""}`}>{BRL(jaAdiantado + jaFinal)}</div></div>
                  <div><div className="text-muted-foreground">A receber</div><div className="font-semibold text-primary">{BRL(aReceber)}</div></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Número da NF *</Label>
                    <Input value={nfForm.numero_nf} onChange={(e) => setNfForm({ ...nfForm, numero_nf: e.target.value })} maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor da NF (R$) *</Label>
                    <CurrencyInput value={nfForm.valor_nf} onValueChange={(v) => setNfForm({ ...nfForm, valor_nf: v ?? 0 })} />
                    {excedeu && (
                      <p className="text-xs text-destructive">Valor excede o saldo a receber ({BRL(aReceber)}).</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Anexos (Nota Fiscal e Promissória)</Label>
                    <span className="text-[11px] text-muted-foreground">{(nfFile ? 1 : 0) + (nfFile2 ? 1 : 0)}/2</span>
                  </div>

                  <div className="space-y-1.5 rounded-md border border-border/40 bg-background/60 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Nota fiscal *</Label>
                      {nfFile && (
                        <button type="button" className="text-[11px] text-destructive hover:underline" onClick={() => setNfFile(null)}>
                          Remover
                        </button>
                      )}
                    </div>
                    <Input
                      type="file"
                      accept=".pdf,.xml,application/pdf,text/xml,application/xml,image/*"
                      onChange={(e) => setNfFile(e.target.files?.[0] ?? null)}
                    />
                    {nfFile && (
                      <p className="text-xs text-muted-foreground truncate">
                        {nfFile.name} · {(nfFile.size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 rounded-md border border-border/40 bg-background/60 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Promissória (opcional)</Label>
                      {nfFile2 && (
                        <button type="button" className="text-[11px] text-destructive hover:underline" onClick={() => setNfFile2(null)}>
                          Remover
                        </button>
                      )}
                    </div>
                    <Input
                      type="file"
                      accept=".pdf,.xml,application/pdf,text/xml,application/xml,image/*"
                      onChange={(e) => setNfFile2(e.target.files?.[0] ?? null)}
                    />
                    {nfFile2 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {nfFile2.name} · {(nfFile2.size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Formatos: PDF, XML ou imagem (máx. 15 MB cada). Arquivados em uma pasta com o nome do cliente, unidade e empreendimento.
                  </p>
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

function Kpi({ icon, label, value, accent, danger }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`glass-card p-4 ${danger ? "border border-destructive/30" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
      <div className={`mt-2 font-display text-2xl font-semibold ${danger ? "text-destructive" : accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function RequestPill({ r }: { r: { id: string; tipo: string; valor_solicitado: number; status: string; motivo_negacao: string | null } }) {
  const map: Record<string, { c: string; i: React.ReactNode; l: string }> = {
    pendente: { c: "bg-amber-500/10 text-amber-500 border-amber-500/30", i: <Clock className="w-3 h-3" />, l: "Pendente" },
    aprovado: { c: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", i: <CheckCircle2 className="w-3 h-3" />, l: "Aprovado" },
    negado: { c: "bg-destructive/10 text-destructive border-destructive/30", i: <XCircle className="w-3 h-3" />, l: "Negado" },
    pago: { c: "bg-primary/10 text-primary border-primary/30", i: <Wallet className="w-3 h-3" />, l: "Pago" },
  };
  const s = map[r.status] ?? map.pendente;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${s.c}`} title={r.motivo_negacao ?? undefined}>
      {s.i}<FileText className="w-3 h-3" /> {r.tipo === "adiantamento" ? "Adiant." : "Comiss."}: {BRL(r.valor_solicitado)} · {s.l}
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
