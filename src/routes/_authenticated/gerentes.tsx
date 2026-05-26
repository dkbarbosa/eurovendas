import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  getGerenteOverview,
  listDistinctGerentes,
  createGerenteCommissionRequest,
} from "@/lib/gerente.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SaleNFCell, useMyNFs, type MyNFItem } from "@/components/nf/SaleNFCell";
import { GroupedNFEmitter, type PendingNFItem } from "@/components/nf/GroupedNFEmitter";
import { MinhasDevolucoesPendentes } from "@/components/distratos/MinhasDevolucoesPendentes";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Wallet, TrendingUp, Receipt, Ban, Send, Search,
  CircleDollarSign, Clock, FileText, CheckCircle2, Timer,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/gerentes")({
  component: GerentesPage,
  head: () => ({ meta: [{ title: "Painel do Gerente · Gestão Comercial" }] }),
});

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

const firstDayOfMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

function GerentesPage() {
  const { isAdmin, isGerente } = useAuth();
  const qc = useQueryClient();

  const [adminPick, setAdminPick] = usePersistentState<string | undefined>(
    "gerentes:adminPick",
    undefined,
  );
  const [dateFrom, setDateFrom] = usePersistentState<string>("gerentes:from", firstDayOfMonth());
  const [dateTo, setDateTo] = usePersistentState<string>("gerentes:to", today());
  const [search, setSearch] = usePersistentState<string>("gerentes:search", "");
  const [corretorFilter, setCorretorFilter] = useState<string>("all");

  const fnList = useServerFn(listDistinctGerentes);
  const fnOverview = useServerFn(getGerenteOverview);
  const fnCreate = useServerFn(createGerenteCommissionRequest);

  const { data: gerentes = [] } = useQuery({
    queryKey: ["distinct-gerentes"],
    queryFn: () => fnList(),
    enabled: isAdmin,
  });

  const overviewArg = isAdmin ? adminPick : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["gerente-overview", overviewArg],
    queryFn: () => fnOverview({ data: overviewArg ? { gerente_nome: overviewArg } : undefined }),
    refetchInterval: 15_000,
  });

  const sales = data?.sales ?? [];
  const requests = data?.requests ?? [];
  const distratos = data?.distratos ?? [];
  const distratoBySale = useMemo(() => {
    const m = new Map<string, (typeof distratos)[number]>();
    for (const d of distratos) if (d.status !== "cancelado") m.set(d.sale_id, d);
    return m;
  }, [distratos]);
  const gerenteNome = data?.gerenteNome ?? null;

  // Marca venda como elegível para solicitação independentemente do período:
  // status não bloqueado, saldo > 0, e (CAIXA OU sinal suficiente para adiantamento).
  const eligibleSaleIds = useMemo(() => {
    const ids = new Set<string>();
    const pagoMap = new Map<string, number>();
    for (const r of sales) pagoMap.set(r.id, 0);
    for (const r of requests) {
      if (r.status === "pago") pagoMap.set(r.sale_id, (pagoMap.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
    }
    for (const s of sales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO" || stUp === "DISTRATO") continue;
      const comLiq = Number(s.comissao_liq_gerente) || 0;
      const pago = pagoMap.get(s.id) ?? 0;
      if (comLiq - pago <= 0) continue;
      const sinalSale = Number((s as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
      const sinalOk = sinalSale >= 2999.99;
      if (stUp === "CAIXA" || sinalOk) ids.add(s.id);
    }
    return ids;
  }, [sales, requests]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const d = (s.data ?? "").slice(0, 10);
      const isEligible = eligibleSaleIds.has(s.id);
      if (!isEligible) {
        if (dateFrom && d && d < dateFrom) return false;
        if (dateTo && d && d > dateTo) return false;
      }
      if (q && !`${s.comprador ?? ""} ${s.empreendimento ?? ""}`.toLowerCase().includes(q)) return false;
      if (corretorFilter !== "all" && (s.corretor ?? "") !== corretorFilter) return false;
      return true;
    }).sort((a, b) => {
      const aOpen = requests.some((r) => r.sale_id === a.id && (r.status === "pendente" || r.status === "aprovado"));
      const bOpen = requests.some((r) => r.sale_id === b.id && (r.status === "pendente" || r.status === "aprovado"));
      const aRank = aOpen ? 0 : eligibleSaleIds.has(a.id) ? 1 : 2;
      const bRank = bOpen ? 0 : eligibleSaleIds.has(b.id) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return String(b.data ?? "").localeCompare(String(a.data ?? ""));
    });
  }, [sales, dateFrom, dateTo, search, corretorFilter, eligibleSaleIds, requests]);

  const corretoresDaEquipe = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) if (s.corretor) set.add(s.corretor);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales]);

  const paidByReq = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "pago") {
        m.set(r.sale_id, (m.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
      }
    }
    return m;
  }, [requests]);

  const pendByReq = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of requests) {
      if (r.status === "pendente" || r.status === "aprovado") m.set(r.sale_id, true);
    }
    return m;
  }, [requests]);

  const kpis = useMemo(() => {
    let comGerente = 0;
    let count = 0;
    for (const s of filteredSales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO" || stUp === "DISTRATO") continue;
      comGerente += Number(s.comissao_liq_gerente) || 0;
      count += 1;
    }
    let pago = 0;
    let pendValor = 0;
    let pendCount = 0;
    let aprovValor = 0;
    let adiantPago = 0;
    let valorSolicitado = 0;
    let emAndamentoCount = 0;
    for (const r of requests) {
      const v = Number(r.valor_solicitado) || 0;
      if (r.status === "pago") {
        pago += v;
        if (r.tipo === "adiantamento") adiantPago += v;
      } else if (r.status === "pendente") {
        pendValor += v;
        pendCount += 1;
        valorSolicitado += v;
        emAndamentoCount += 1;
      } else if (r.status === "aprovado") {
        aprovValor += v;
        valorSolicitado += v;
        emAndamentoCount += 1;
      }
    }
    const aReceber = Math.max(0, comGerente - pago);

    // Evolução mensal de solicitações
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    let curMonthValor = 0, prevMonthValor = 0;
    for (const r of requests) {
      if (!r.created_at) continue;
      const k = String(r.created_at).slice(0, 7);
      const v = Number(r.valor_solicitado) || 0;
      if (k === curKey) curMonthValor += v;
      else if (k === prevKey) prevMonthValor += v;
    }
    const evolucaoPct = prevMonthValor > 0
      ? ((curMonthValor - prevMonthValor) / prevMonthValor) * 100
      : (curMonthValor > 0 ? 100 : null);

    const distratosCount = distratos.length;
    const distratosImpacto = distratos.reduce(
      (s, d) => s + (Number(d.valor_comissao_gerente) || 0), 0,
    );
    return {
      comGerente, count, pago, adiantPago, pendValor, pendCount, aprovValor, aReceber,
      valorSolicitado, emAndamentoCount, curMonthValor, prevMonthValor, evolucaoPct,
      distratosCount, distratosImpacto,
    };
  }, [filteredSales, requests, distratos]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; vendas: number; comissao: number }>();
    for (const s of filteredSales) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vendas: 0, comissao: 0 };
      cur.vendas += 1;
      cur.comissao += Number(s.comissao_liq_gerente) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [filteredSales]);




  // diálogo de solicitação
  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: (typeof sales)[number] | null }>(
    { open: false, sale: null },
  );
  const [reqForm, setReqForm] = useState({
    tipo: "" as "" | "adiantamento" | "comissao_final",
    valor: null as number | null,
    obs: "",
  });
  const openReq = (s: (typeof sales)[number]) => {
    setReqForm({ tipo: "", valor: null, obs: "" });
    setReqDialog({ open: true, sale: s });
  };
  const createMut = useMutation({
    mutationFn: () => {
      if (!reqForm.tipo) throw new Error("Escolha entre Adiantamento ou Comissão final.");
      return fnCreate({
        data: {
          sale_id: reqDialog.sale!.id,
          tipo: reqForm.tipo,
          valor_solicitado: reqForm.valor ?? 0,
          bonus: 0,
          observacao: reqForm.obs || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Solicitação enviada ao financeiro.");
      setReqDialog({ open: false, sale: null });
      qc.invalidateQueries({ queryKey: ["gerente-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin && !isGerente) {
    return <div className="text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Painel Gerência</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Painel Financeiro</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualizando: <b className="text-foreground">{gerenteNome ?? (isAdmin ? "—" : "Sem vínculo")}</b>
            </p>
          </div>
          {isAdmin && (
            <div className="min-w-[260px]">
              <Label className="text-xs">Ver como gerente</Label>
              <Select value={adminPick ?? ""} onValueChange={(v) => setAdminPick(v || undefined)}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {gerentes.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      {/* Filtros */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Corretor</Label>
            <Select value={corretorFilter} onValueChange={setCorretorFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {corretoresDaEquipe.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente / Empreend.</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite o nome…" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{filteredSales.length} venda(s) no período</span>
          <button
            className="underline hover:text-foreground"
            onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(today()); setSearch(""); setCorretorFilter("all"); }}
          >
            Restaurar mês atual
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-12 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : !gerenteNome ? (
        <div className="glass-card p-8 text-muted-foreground">
          {isAdmin ? "Selecione um gerente acima para visualizar o painel." : "Seu usuário ainda não está vinculado a um gerente. Fale com o administrador."}
        </div>
      ) : (
        <>
          <GerenteGroupedNFs />
          {/* KPIs financeiros */}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Comissão Total" value={BRL(kpis.comGerente)} />
            <Kpi icon={<Wallet className="w-4 h-4" />} label="Adiantamentos" value={BRL(kpis.adiantPago)} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Recebidos" value={BRL(kpis.pago)} />
            <Kpi icon={<Clock className="w-4 h-4" />} label="A Receber" value={BRL(kpis.aReceber)} accent />
            <Kpi
              icon={<Send className="w-4 h-4" />}
              label="Valor Solicitado"
              value={BRL(kpis.valorSolicitado)}
              warn
              hint={kpis.pendCount > 0 ? `${kpis.pendCount} solicitação(ões) pendente(s)` : "Nenhuma pendente"}
            />
            <Kpi icon={<FileText className="w-4 h-4" />} label="Vendas / Pendentes" value={`${kpis.count} / ${kpis.pendCount}`} />
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

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Comissão por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gerComBarGrad" x1="0" y1="0" x2="0" y2="1">
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
                    <Bar dataKey="comissao" fill="url(#gerComBarGrad)" radius={[8, 8, 0, 0]} maxBarSize={56} />
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
                      <linearGradient id="gerVendasLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="oklch(0.78 0.16 180)" />
                        <stop offset="100%" stopColor="oklch(0.78 0.14 90)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="vendas" stroke="url(#gerVendasLineGrad)" strokeWidth={2.5} dot={{ r: 3, fill: "oklch(0.78 0.16 180)" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>


          <MinhasDevolucoesPendentes compact />

          {/* Tabela principal de comissão */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              <h2 className="font-display text-xl">Comissões por venda</h2>
            </div>
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[1040px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Comprador</th>
                    <th className="text-left p-3">Empreend. / Un.</th>
                    <th className="text-left p-3">Corretor</th>
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
                  {filteredSales.length === 0 && (
                    <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nenhuma venda no período.</td></tr>
                  )}
                  {filteredSales.map((s) => {
                    const comLiq = Number(s.comissao_liq_gerente) || 0;
                    const pago = paidByReq.get(s.id) ?? 0;
                    const aReceber = Math.max(0, comLiq - pago);
                    const stUp = (s.status ?? "").trim().toUpperCase();
                    const blocked = stUp === "RESERVADO" || stUp === "DISTRATO";
                    const isFinalizada = aReceber <= 0 && comLiq > 0;
                    const sinalSale = Number((s as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
                    const sinalOk = sinalSale >= 2999.99;
                    const isCaixa = stUp === "CAIXA";
                    const pend = pendByReq.get(s.id) ?? false;
                    const ruleOk = !blocked && aReceber > 0 && (isCaixa || sinalOk);
                    const d10 = (s.data ?? "").slice(0, 10);
                    const isOutOfPeriod = !!d10 && ((dateFrom && d10 < dateFrom) || (dateTo && d10 > dateTo));
                    const btnLabel = blocked
                      ? stUp
                      : pend
                        ? "Pendente"
                        : !isCaixa && !sinalOk
                          ? "Sinal insuficiente"
                          : "Solicitar";
                    const btnTitle = !isCaixa && !sinalOk && !blocked
                      ? `Sinal de ${BRL(sinalSale)} é menor que R$ 2.999,99 — adiantamento não liberado.`
                      : "";
                    return (
                      <tr key={s.id} className={`border-t border-border align-top ${isOutOfPeriod ? "bg-primary/[0.04]" : ""}`}>
                        <td className="p-3 whitespace-nowrap">
                          <div>{fmtBR(s.data)}</div>
                          {isOutOfPeriod && (
                            <Badge variant="outline" className="mt-1 text-[10px] border-primary/40 text-primary bg-primary/10">
                              Fora do período
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-medium">
                          <div>{s.comprador ?? "—"}</div>
                          {(() => {
                            const dist = distratoBySale.get(s.id);
                            const saldoDevedor = dist ? Math.max(0, pago) : 0;
                            if (!dist && stUp !== "DISTRATO") return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      title="Ver histórico do distrato"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-destructive/40 bg-destructive/10 text-destructive text-[10px] hover:bg-destructive/20 transition-colors"
                                    >
                                      <Ban className="w-2.5 h-2.5" />
                                      {dist ? `Distrato · devolver ${BRL(dist.valor_devolver)}` : "Distrato"}
                                      <span className="opacity-70">· Histórico</span>
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="w-80 p-3 space-y-2 text-xs">
                                    <div className="font-medium flex items-center gap-1.5 text-destructive">
                                      <Ban className="w-3.5 h-3.5" /> Histórico do distrato
                                    </div>
                                    {dist ? (
                                      <>
                                        <div>Cliente: <b>{s.comprador ?? "—"}</b></div>
                                        <div>Valor a devolver: <b className="text-destructive">{BRL(dist.valor_devolver)}</b></div>
                                        <div>Status: <b className="capitalize">{String(dist.status).replace("_", " ")}</b></div>
                                        <div>Lançado em: {fmtBR((dist as { created_at?: string }).created_at ?? null)}</div>
                                        {dist.motivo && (
                                          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2">
                                            <div className="text-[10px] uppercase tracking-wide text-destructive mb-0.5">Motivo</div>
                                            <div className="whitespace-pre-wrap break-words">{dist.motivo}</div>
                                          </div>
                                        )}
                                        {(dist as { observacao_financeiro?: string | null }).observacao_financeiro && (
                                          <div className="rounded-md border border-border bg-muted/30 p-2">
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Observação do financeiro</div>
                                            <div className="whitespace-pre-wrap break-words">{(dist as { observacao_financeiro?: string | null }).observacao_financeiro}</div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground italic">Status da venda marcado como distrato na planilha.</div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                                {saldoDevedor > 0 && (
                                  <div className="text-[10px] text-destructive font-medium">
                                    Saldo devedor: {BRL(saldoDevedor)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="p-3 text-muted-foreground">
                          <div>{s.empreendimento ?? "—"}</div>
                          <div className="text-xs">Unid: {s.unidade ?? "—"}</div>
                        </td>
                        <td className="p-3">{s.corretor ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">{BRL(s.valor_venda)}</td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap font-medium">{BRL(comLiq)}</td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">
                          <span className={pago > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"}>{BRL(pago)}</span>
                        </td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">
                          {isFinalizada ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />100% pago
                            </span>
                          ) : (
                            <span className={aReceber > 0 ? "text-primary font-semibold" : "text-muted-foreground"}>{BRL(aReceber)}</span>
                          )}
                        </td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{s.status ?? "—"}</Badge></td>
                        <td className="p-3">
                          {pend && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 mb-1">
                              NF · solicitada
                            </Badge>
                          )}
                          <SaleNFCell saleId={s.id} role="gerente" />
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            disabled={!ruleOk || pend}
                            title={btnTitle}
                            onClick={() => openReq(s)}
                            style={ruleOk && !pend ? { background: "var(--gradient-primary)", color: "var(--primary-foreground)" } : undefined}
                            variant={ruleOk && !pend ? "default" : "outline"}
                          >
                            <Send className="w-3 h-3 mr-1" /> {btnLabel}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Distratos que impactam a comissão */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-destructive" />
              <h2 className="font-display text-xl">Distratos</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Kpi icon={<Ban className="w-4 h-4" />} label="Distratos ativos" value={String(kpis.distratosCount)} />
              <Kpi icon={<CircleDollarSign className="w-4 h-4" />} label="Impacto na sua comissão" value={BRL(kpis.distratosImpacto)} />
            </div>
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Criado</th>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Empreend./Un.</th>
                    <th className="text-left p-3">Corretor</th>
                    <th className="text-right p-3">Devolver</th>
                    <th className="text-right p-3">Sua comissão</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {distratos.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="p-3">{fmtBR(d.created_at)}</td>
                      <td className="p-3 font-medium">{d.comprador ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {d.empreendimento ?? "—"} {d.unidade ? `· ${d.unidade}` : ""}
                      </td>
                      <td className="p-3">{d.corretor_nome ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums">{BRL(d.valor_devolver)}</td>
                      <td className="p-3 text-right tabular-nums">{BRL(d.valor_comissao_gerente)}</td>
                      <td className="p-3"><Badge variant="outline">{d.status}</Badge></td>
                    </tr>
                  ))}
                  {distratos.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum distrato impactando sua comissão.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      

      {/* Diálogo solicitação */}
      <Dialog open={reqDialog.open} onOpenChange={(open) => !open && setReqDialog({ open: false, sale: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar adiantamento / comissão (gerente)</DialogTitle>
            <DialogDescription>
              {reqDialog.sale && (
                <>Venda: <b>{reqDialog.sale.comprador}</b> · {reqDialog.sale.empreendimento} / {reqDialog.sale.unidade} · {fmtBR(reqDialog.sale.data)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sale = reqDialog.sale;
            if (!sale) return null;
            const comLiq = Number(sale.comissao_liq_gerente) || 0;
            const valorVenda = Number(sale.valor_venda) || 0;
            const statusUp = (sale.status ?? "").trim().toUpperCase();
            const jaPago = paidByReq.get(sale.id) ?? 0;
            const maxReceber = Math.max(0, comLiq - jaPago);
            const valor = reqForm.valor ?? 0;
            const sinal = Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
            const excedeu = valor > maxReceber + 0.01;
            const minSinalComissao = valorVenda * 0.06;
            const maxAdiant = Math.floor(sinal / 2999.99) * 500;
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
                    <div><div className="text-muted-foreground">Já adiantado</div><div className={`font-semibold ${jaPago > 0 ? "text-amber-400" : ""}`}>{BRL(jaPago)}</div></div>
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
                        <div className="text-muted-foreground">• <b>Assinado:</b> adiantamento exige <b>R$ 2.999,99</b> de sinal a cada <b>R$ 500</b> (regra do gerente).</div>
                        <div className="text-muted-foreground">• Comissão final exige sinal ≥ <b>6%</b> da venda{valorVenda > 0 ? <> (mín. <b>{BRL(minSinalComissao)}</b>)</> : null}.</div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={reqForm.tipo || undefined} onValueChange={(v) => setReqForm((f) => ({ ...f, tipo: v as "adiantamento" | "comissao_final" }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adiantamento">Adiantamento</SelectItem>
                          <SelectItem value="comissao_final">Comissão final</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor solicitado (R$)</Label>
                      <CurrencyInput value={reqForm.valor} onValueChange={(v) => setReqForm((f) => ({ ...f, valor: v }))} />
                      {excedeu && (
                        <p className="text-xs text-destructive">Valor excede o saldo a receber ({BRL(maxReceber)}).</p>
                      )}
                      {!excedeu && valor > 0 && (
                        <p className="text-xs text-muted-foreground">Restante após este pedido: {BRL(maxReceber - valor)}</p>
                      )}
                      {reqForm.tipo === "adiantamento" && sinal >= 2999.99 && valor > maxAdiant && (
                        <p className="text-xs text-destructive">Adiantamento máximo permitido: {BRL(maxAdiant)} (R$ 500 a cada R$ 2.999,99 de sinal).</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Sinal recebido (R$)</Label>
                      <CurrencyInput value={sinal} onValueChange={() => {}} disabled />
                      {statusUp !== "CAIXA" && reqForm.tipo === "adiantamento" && sinal > 0 && sinal < 2999.99 && (
                        <p className="text-xs text-destructive">Sinal precisa ser ≥ R$ 2.999,99 para liberar adiantamento.</p>
                      )}
                      {statusUp !== "CAIXA" && reqForm.tipo === "comissao_final" && valorVenda > 0 && sinal > 0 && sinal < minSinalComissao && (
                        <p className="text-xs text-destructive">Sinal abaixo de 6% do valor da venda (mín. {BRL(minSinalComissao)}).</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status da venda</Label>
                      <div className="h-9 px-3 flex items-center rounded-md border border-border bg-secondary/20 text-sm">
                        <Badge variant="outline">{sale.status ?? "—"}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações</Label>
                    <Textarea value={reqForm.obs} onChange={(e) => setReqForm((f) => ({ ...f, obs: e.target.value }))} rows={3} maxLength={2000} placeholder="Detalhes para o financeiro…" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setReqDialog({ open: false, sale: null })}>Cancelar</Button>
                  <Button
                    disabled={createMut.isPending || !reqForm.tipo || !reqForm.valor || excedeu || ruleViolated}
                    onClick={() => createMut.mutate()}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar pedido"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon, label, value, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  warn?: boolean;
  premium?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/40">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    aprovado: "bg-primary/15 text-primary border-primary/30",
    pago: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    negado: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    distratado: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

function GerenteGroupedNFs() {
  const { data: nfs = [] } = useMyNFs();
  const items: PendingNFItem[] = useMemo(
    () =>
      (nfs as MyNFItem[])
        .filter((n) => n.status === "solicitada" && (n.requester_role ?? "corretor") === "gerente")
        .map((n) => ({
          id: n.id,
          valor_nf: n.valor_nf,
          sale_id: n.sale_id,
          desconto_distrato: n.desconto_distrato ?? null,
          observacao_distrato: n.observacao_distrato ?? null,
          sale: n.sale
            ? { comprador: n.sale.comprador, empreendimento: n.sale.empreendimento, unidade: n.sale.unidade, data: n.sale.data }
            : null,
        })),

    [nfs],
  );
  if (items.length === 0) return null;
  return <GroupedNFEmitter items={items} role="gerente" invalidateKeys={[["gerente-overview"]]} />;
}
