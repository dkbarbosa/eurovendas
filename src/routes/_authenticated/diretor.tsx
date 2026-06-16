import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  getDiretorOverview,
  createDiretorCommissionRequest,
} from "@/lib/diretor.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SaleNFCell, useMyNFs, type MyNFItem } from "@/components/nf/SaleNFCell";
import { GroupedNFEmitter, type PendingNFItem } from "@/components/nf/GroupedNFEmitter";
import { SaleTimelineButton } from "@/components/history/SaleTimelineButton";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Wallet, TrendingUp, Send, Search,
  Clock, CheckCircle2, Timer, FileText, ShieldCheck, Ban,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/diretor")({
  component: DiretorPage,
  head: () => ({ meta: [{ title: "Painel Financeiro · Gestão" }] }),
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

type SaleWithCom = {
  id: string;
  data: string | null;
  comprador: string | null;
  empreendimento: string | null;
  unidade: string | null;
  corretor: string | null;
  gerente: string | null;
  coaphar: string | null;
  valor_venda: number | null;
  valor_sinal_negocio: number | null;
  status: string | null;
  comissao_diretor: number;
};

function DiretorPage() {
  const { isAdmin, isDiretor } = useAuth();
  const qc = useQueryClient();

  const [dateFrom, setDateFrom] = usePersistentState<string>("diretor:from", firstDayOfMonth());
  const [dateTo, setDateTo] = usePersistentState<string>("diretor:to", today());
  const [search, setSearch] = usePersistentState<string>("diretor:search", "");

  const fnOverview = useServerFn(getDiretorOverview);
  const fnCreate = useServerFn(createDiretorCommissionRequest);

  const { data, isLoading } = useQuery({
    queryKey: ["diretor-overview"],
    queryFn: () => fnOverview(),
    refetchInterval: 45_000,
    enabled: isAdmin || isDiretor,
  });

  const sales = (data?.sales ?? []) as SaleWithCom[];
  const requests = data?.requests ?? [];
  const distratos = (data as { distratos?: Array<{ sale_id: string; status: string; valor_devolver: number; valor_devolver_role?: number; motivo: string | null; observacao_financeiro: string | null; created_at: string }> } | undefined)?.distratos ?? [];
  const distratoBySale = useMemo(() => {
    const m = new Map<string, (typeof distratos)[number]>();
    for (const d of distratos) m.set(d.sale_id, d);
    return m;
  }, [distratos]);



  // Vendas elegíveis aparecem mesmo fora do período (regra OK).
  const eligibleSaleIds = useMemo(() => {
    const ids = new Set<string>();
    const pagoMap = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "pago") pagoMap.set(r.sale_id, (pagoMap.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
    }
    for (const s of sales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO" || stUp === "DISTRATO") continue;
      const com = Number(s.comissao_diretor) || 0;
      const pago = pagoMap.get(s.id) ?? 0;
      if (com - pago <= 0) continue;
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
      if (q && !`${s.comprador ?? ""} ${s.empreendimento ?? ""} ${s.corretor ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => {
      const aOpen = requests.some((r) => r.sale_id === a.id && r.status === "pendente");
      const bOpen = requests.some((r) => r.sale_id === b.id && r.status === "pendente");
      const aRank = aOpen ? 0 : eligibleSaleIds.has(a.id) ? 1 : 2;
      const bRank = bOpen ? 0 : eligibleSaleIds.has(b.id) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return String(b.data ?? "").localeCompare(String(a.data ?? ""));
    });
  }, [sales, dateFrom, dateTo, search, eligibleSaleIds, requests]);

  const kpis = useMemo(() => {
    let comTotal = 0;
    let count = 0;
    for (const s of filteredSales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO" || stUp === "DISTRATO") continue;
      comTotal += s.comissao_diretor;
      count += 1;
    }
    let pago = 0, pendValor = 0, pendCount = 0, aprovValor = 0, valorSolicitado = 0;
    for (const r of requests) {
      const v = Number(r.valor_solicitado) || 0;
      if (r.status === "pago") pago += v;
      else if (r.status === "pendente") { pendValor += v; pendCount += 1; valorSolicitado += v; }
      else if (r.status === "aprovado") { aprovValor += v; valorSolicitado += v; }
    }
    const aReceber = Math.max(0, comTotal - pago);

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

    return { comTotal, count, pago, pendValor, pendCount, aprovValor, aReceber, valorSolicitado, curMonthValor, prevMonthValor, evolucaoPct };
  }, [filteredSales, requests]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; vendas: number; comissao: number }>();
    for (const s of filteredSales) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vendas: 0, comissao: 0 };
      cur.vendas += 1;
      cur.comissao += s.comissao_diretor;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [filteredSales]);

  const paidBySale = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "pago") m.set(r.sale_id, (m.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
    }
    return m;
  }, [requests]);
  const pendBySale = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of requests) if (r.status === "pendente") m.set(r.sale_id, true);
    return m;
  }, [requests]);

  const { data: allNfs = [] } = useMyNFs();
  const nfsBySale = useMemo(() => {
    const m = new Map<string, MyNFItem[]>();
    for (const n of allNfs) {
      const arr = m.get(n.sale_id) ?? [];
      arr.push(n);
      m.set(n.sale_id, arr);
    }
    return m;
  }, [allNfs]);
  const requestsBySale = useMemo(() => {
    const m = new Map<string, typeof requests>();
    for (const r of requests) {
      const arr = m.get(r.sale_id) ?? [];
      arr.push(r);
      m.set(r.sale_id, arr);
    }
    return m;
  }, [requests]);

  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: SaleWithCom | null }>({ open: false, sale: null });
  const [reqForm, setReqForm] = useState({
    tipo: "" as "" | "adiantamento" | "comissao_final",
    valor: null as number | null,
    obs: "",
  });
  const openReq = (s: SaleWithCom) => {
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
          observacao: reqForm.obs || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Solicitação enviada ao financeiro.");
      setReqDialog({ open: false, sale: null });
      qc.invalidateQueries({ queryKey: ["diretor-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin && !isDiretor) {
    return <div className="text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground inline-flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" /> Painel Gestão
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Painel Financeiro</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Comissão calculada sobre <b className="text-foreground">todas as vendas</b> · 0,4% do valor da venda (4,5% de desconto quando COAPHAR = Sim).
            </p>
          </div>
        </div>
      </header>

      <div className="glass-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente / Empreend. / Corretor</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para buscar…" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{filteredSales.length} venda(s) no período</span>
          <button
            className="underline hover:text-foreground"
            onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(today()); setSearch(""); }}
          >
            Restaurar mês atual
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-12 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <DiretorGroupedNFs />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">

            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Comissão Total" value={BRL(kpis.comTotal)} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Recebidos" value={BRL(kpis.pago)} />
            <Kpi icon={<Clock className="w-4 h-4" />} label="A Receber" value={BRL(kpis.aReceber)} accent />
            <Kpi
              icon={<Send className="w-4 h-4" />}
              label="Valor Solicitado"
              value={BRL(kpis.valorSolicitado)}
              warn
              hint={kpis.pendCount > 0 ? `${kpis.pendCount} pendente(s)` : "Nenhuma pendente"}
            />
            <Kpi icon={<FileText className="w-4 h-4" />} label="Vendas no período" value={String(kpis.count)} />
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
                      <linearGradient id="dirBarGrad" x1="0" y1="0" x2="0" y2="1">
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
                    <Bar dataKey="comissao" fill="url(#dirBarGrad)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Vendas por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="vendas" stroke="oklch(0.78 0.16 180)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>


          

          {/* Vendas + ação de pedido */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <h2 className="font-display text-xl">Vendas e comissão (0,4%)</h2>
            </div>
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Comprador</th>
                    <th className="text-left p-3">Empreend. / Un.</th>
                    <th className="text-left p-3">Corretor</th>
                    <th className="text-center p-3">COAPHAR</th>
                    <th className="text-right p-3">VGV</th>
                    <th className="text-right p-3">Sinal</th>
                    <th className="text-right p-3">Comissão (0,4%)</th>
                    <th className="text-right p-3">Recebido</th>
                    <th className="text-left p-3">Pedidos / NF</th>
                    <th className="p-3">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Nenhuma venda no período.</td></tr>
                  ) : filteredSales.map((s) => {
                    const pago = paidBySale.get(s.id) ?? 0;
                    const pend = pendBySale.get(s.id) ?? false;
                    const stUp = (s.status ?? "").trim().toUpperCase();
                    const bloqueado = stUp === "RESERVADO" || stUp === "DISTRATO";
                    const sinalSale = Number((s as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
                    const sinalOk = sinalSale >= 2999.99;
                    const isCaixa = stUp === "CAIXA";
                    const com = Number(s.comissao_diretor) || 0;
                    const aReceber = Math.max(0, com - pago);
                    const jaTevePagamento = pago > 0;
                    // Saldo residual de até R$ 0,50 é considerado finalizado.
                    const aguardandoCaixa = jaTevePagamento && !isCaixa && aReceber > 0.5;
                    const ruleOk = !bloqueado && aReceber > 0.5 && !aguardandoCaixa && (isCaixa || sinalOk);
                    const d10 = (s.data ?? "").slice(0, 10);
                    const isOutOfPeriod = !!d10 && ((dateFrom && d10 < dateFrom) || (dateTo && d10 > dateTo));
                    const btnLabel = bloqueado
                      ? stUp
                      : pend
                        ? "Pendente"
                        : aguardandoCaixa
                          ? "Aguardando CAIXA"
                          : !isCaixa && !sinalOk
                            ? "Sinal insuficiente"
                            : "Solicitar";
                    const btnTitle = aguardandoCaixa
                      ? "Já existe um adiantamento pago para esta venda. Aguarde o status virar CAIXA para liberar nova solicitação."
                      : !isCaixa && !sinalOk && !bloqueado
                        ? `Sinal de ${BRL(sinalSale)} é menor que R$ 2.999,99 — adiantamento não liberado.`
                        : "";
                    return (
                      <tr key={s.id} className={`border-t border-border ${isOutOfPeriod ? "bg-primary/[0.04]" : ""}`}>
                        <td className="p-3">
                          <div>{fmtBR(s.data)}</div>
                          {isOutOfPeriod && (
                            <Badge variant="outline" className="mt-1 text-[10px] border-primary/40 text-primary bg-primary/10">
                              Fora do período
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div>{s.comprador ?? "—"}</div>
                          {(() => {
                            const dist = distratoBySale.get(s.id);
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
                                      {dist ? `Distrato · devolver ${BRL(dist.valor_devolver_role ?? dist.valor_devolver)}` : "Venda distratada"}
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
                                        <div>Valor a devolver: <b className="text-destructive">{BRL(dist.valor_devolver_role ?? dist.valor_devolver)}</b></div>
                                        <div>Status: <b className="capitalize">{dist.status.replace("_", " ")}</b></div>
                                        <div>Lançado em: {fmtBR(dist.created_at)}</div>
                                        {dist.motivo && (
                                          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2">
                                            <div className="text-[10px] uppercase tracking-wide text-destructive mb-0.5">Motivo</div>
                                            <div className="whitespace-pre-wrap break-words">{dist.motivo}</div>
                                          </div>
                                        )}
                                        {dist.observacao_financeiro && (
                                          <div className="rounded-md border border-border bg-muted/30 p-2">
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Observação do financeiro</div>
                                            <div className="whitespace-pre-wrap break-words">{dist.observacao_financeiro}</div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground italic">Status da venda marcado como distrato na planilha.</div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                                {pago > 0 && (
                                  <div className="text-[10px] text-destructive font-medium">
                                    Saldo devedor: {BRL(pago)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="p-3 text-xs">
                          <div>{s.empreendimento ?? "—"}</div>
                          <div className="text-muted-foreground">{s.unidade ?? ""}</div>
                        </td>
                        <td className="p-3">{s.corretor ?? "—"}</td>
                        <td className="p-3 text-center">
                          {String(s.coaphar ?? "").trim().toLowerCase().startsWith("s")
                            ? <Badge variant="secondary">Sim</Badge>
                            : <span className="text-muted-foreground text-xs">Não</span>}
                        </td>
                        <td className="p-3 text-right">{BRL(s.valor_venda)}</td>
                        <td className="p-3 text-right">{BRL(s.valor_sinal_negocio)}</td>
                        <td className="p-3 text-right font-medium">{BRL(s.comissao_diretor)}</td>
                        <td className="p-3 text-right text-emerald-400">{BRL(pago)}</td>
                        <td className="p-3">
                          {pend && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 mb-1">
                              NF · solicitada
                            </Badge>
                          )}
                          <SaleNFCell saleId={s.id} role="diretor" />
                          <div className="mt-1.5">
                            <SaleTimelineButton
                              sale={{
                                comprador: s.comprador,
                                empreendimento: s.empreendimento,
                                unidade: s.unidade,
                                data: s.data,
                                valor_venda: s.valor_venda,
                              }}
                              requests={(requestsBySale.get(s.id) ?? []) as never}
                              nfs={(nfsBySale.get(s.id) ?? []) as never}
                            />
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {stUp === "DISTRATO" ? (
                            <Badge
                              variant="outline"
                              title="Venda distratada — solicitação bloqueada."
                              className="text-[11px] bg-destructive/10 text-destructive border-destructive/40 cursor-not-allowed select-none"
                            >
                              Venda perdida
                            </Badge>
                          ) : aguardandoCaixa ? (
                            <Badge
                              variant="outline"
                              title={btnTitle}
                              className="text-[11px] bg-sky-500/10 text-sky-400 border-sky-500/40"
                            >
                              Aguardando Caixa
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!ruleOk || pend || (isAdmin && !isDiretor)}
                              title={btnTitle}
                              onClick={() => openReq(s)}
                            >
                              {btnLabel}
                            </Button>
                          )}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      



      <Dialog open={reqDialog.open} onOpenChange={(open) => !open && setReqDialog({ open: false, sale: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar adiantamento / comissão (gestão)</DialogTitle>
            <DialogDescription>
              {reqDialog.sale && (
                <>Venda: <b>{reqDialog.sale.comprador}</b> · {reqDialog.sale.empreendimento} / {reqDialog.sale.unidade} · {fmtBR(reqDialog.sale.data)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sale = reqDialog.sale;
            if (!sale) return null;
            const com = Number(sale.comissao_diretor) || 0;
            const valorVenda = Number(sale.valor_venda) || 0;
            const statusUp = (sale.status ?? "").trim().toUpperCase();
            const jaPago = paidBySale.get(sale.id) ?? 0;
            const maxReceber = Math.max(0, com - jaPago);
            const valor = reqForm.valor ?? 0;
            const sinal = Number((sale as { valor_sinal_negocio?: number | null }).valor_sinal_negocio) || 0;
            const excedeu = valor > maxReceber + 0.01;
            const minSinalComissao = valorVenda * 0.06;
            const maxAdiant = Math.floor(sinal / 2999.99) * 300;
            const isCaixa = statusUp === "CAIXA";
            const isReservado = statusUp === "RESERVADO";
            const ruleAdiantOk = isCaixa || reqForm.tipo !== "adiantamento" || (sinal >= 2999.99 && valor <= maxAdiant);
            const ruleComissaoOk = isCaixa || reqForm.tipo !== "comissao_final" || valorVenda === 0 || sinal >= minSinalComissao;
            const ruleViolated = isReservado || !ruleAdiantOk || !ruleComissaoOk;
            return (
              <>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs grid grid-cols-3 gap-2">
                    <div><div className="text-muted-foreground">Comissão (0,4%)</div><div className="font-semibold">{BRL(com)}</div></div>
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
                        <div className="text-muted-foreground">• <b>Assinado:</b> adiantamento exige <b>R$ 2.999,99</b> de sinal a cada <b>R$ 300</b> (regra da gestão).</div>
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
                        <p className="text-xs text-destructive">Adiantamento máximo permitido: {BRL(maxAdiant)} (R$ 300 a cada R$ 2.999,99 de sinal).</p>
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

function DiretorGroupedNFs() {
  const { data: nfs = [] } = useMyNFs();
  const items: PendingNFItem[] = useMemo(
    () =>
      (nfs as MyNFItem[])
        .filter((n) => n.status === "solicitada" && (n.requester_role ?? "corretor") === "diretor")
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
  return <GroupedNFEmitter items={items} role="diretor" invalidateKeys={[["diretor-overview"]]} />;
}

function Kpi({

  icon, label, value, hint,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string;
  accent?: boolean; warn?: boolean; premium?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-xl mt-1 truncate text-foreground">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
