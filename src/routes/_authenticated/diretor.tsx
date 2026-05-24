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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Wallet, TrendingUp, Send, Search,
  Clock, CheckCircle2, Timer, FileText, ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/diretor")({
  component: DiretorPage,
  head: () => ({ meta: [{ title: "Painel Financeiro · Gerente Geral" }] }),
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
const lastDayOfMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

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
  const [dateTo, setDateTo] = usePersistentState<string>("diretor:to", lastDayOfMonth());
  const [search, setSearch] = usePersistentState<string>("diretor:search", "");

  const fnOverview = useServerFn(getDiretorOverview);
  const fnCreate = useServerFn(createDiretorCommissionRequest);

  const { data, isLoading } = useQuery({
    queryKey: ["diretor-overview"],
    queryFn: () => fnOverview(),
    refetchInterval: 15_000,
    enabled: isAdmin || isDiretor,
  });

  const sales = (data?.sales ?? []) as SaleWithCom[];
  const requests = data?.requests ?? [];

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const d = (s.data ?? "").slice(0, 10);
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo && d && d > dateTo) return false;
      if (q && !`${s.comprador ?? ""} ${s.empreendimento ?? ""} ${s.corretor ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, search]);

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

  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: SaleWithCom | null }>({ open: false, sale: null });
  const [reqForm, setReqForm] = useState({
    tipo: "adiantamento" as "adiantamento" | "comissao_final",
    valor: null as number | null,
    obs: "",
  });
  const openReq = (s: SaleWithCom) => {
    setReqForm({ tipo: "adiantamento", valor: null, obs: "" });
    setReqDialog({ open: true, sale: s });
  };
  const createMut = useMutation({
    mutationFn: () =>
      fnCreate({
        data: {
          sale_id: reqDialog.sale!.id,
          tipo: reqForm.tipo,
          valor_solicitado: reqForm.valor ?? 0,
          observacao: reqForm.obs || undefined,
        },
      }),
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
          <ShieldCheck className="w-3.5 h-3.5" /> Painel Gerente Geral
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
            onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(lastDayOfMonth()); setSearch(""); }}
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

          {/* Solicitações */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="font-display text-xl">Solicitações ao financeiro</h2>
              <span className="text-xs text-muted-foreground ml-2">
                {requests.length} no total · {kpis.pendCount} pendente(s)
              </span>
            </div>
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Criado</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-right p-3">Valor</th>
                    <th className="p-3">Status</th>
                    <th className="text-left p-3">Motivo / Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma solicitação ainda.</td></tr>
                  ) : requests.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3">{fmtBR(r.created_at)}</td>
                      <td className="p-3 capitalize">{r.tipo === "adiantamento" ? "Adiantamento" : "Comissão final"}</td>
                      <td className="p-3 text-right font-medium">{BRL(r.valor_solicitado)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={r.status === "pago" ? "default" : r.status === "negado" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{r.motivo_negacao ?? r.observacao_financeiro ?? r.observacao_corretor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

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
                    <th className="p-3">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhuma venda no período.</td></tr>
                  ) : filteredSales.map((s) => {
                    const pago = paidBySale.get(s.id) ?? 0;
                    const pend = pendBySale.get(s.id) ?? false;
                    const stUp = (s.status ?? "").trim().toUpperCase();
                    const bloqueado = stUp === "RESERVADO" || stUp === "DISTRATO";
                    return (
                      <tr key={s.id} className="border-t border-border">
                        <td className="p-3">{fmtBR(s.data)}</td>
                        <td className="p-3">{s.comprador ?? "—"}</td>
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
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bloqueado || pend || isAdmin && !isDiretor ? true : false}
                            onClick={() => openReq(s)}
                          >
                            {pend ? "Pendente" : bloqueado ? stUp : "Solicitar"}
                          </Button>
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

      <Dialog open={reqDialog.open} onOpenChange={(o) => setReqDialog({ open: o, sale: o ? reqDialog.sale : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar comissão</DialogTitle>
          </DialogHeader>
          {reqDialog.sale && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
                <div><b>{reqDialog.sale.comprador ?? "—"}</b></div>
                <div className="text-muted-foreground">{reqDialog.sale.empreendimento} · {reqDialog.sale.unidade}</div>
                <div className="flex justify-between mt-2">
                  <span>VGV:</span><span>{BRL(reqDialog.sale.valor_venda)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sinal:</span><span>{BRL(reqDialog.sale.valor_sinal_negocio)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Comissão total (0,4%):</span><span>{BRL(reqDialog.sale.comissao_diretor)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={reqForm.tipo === "adiantamento" ? "default" : "outline"}
                    onClick={() => setReqForm((f) => ({ ...f, tipo: "adiantamento" }))}
                  >Adiantamento</Button>
                  <Button
                    type="button"
                    variant={reqForm.tipo === "comissao_final" ? "default" : "outline"}
                    onClick={() => setReqForm((f) => ({ ...f, tipo: "comissao_final" }))}
                  >Comissão final</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {reqForm.tipo === "adiantamento"
                    ? "Adiantamento: exige sinal mínimo de R$ 300,00."
                    : "Comissão final: exige sinal ≥ 6% do VGV."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Valor solicitado</Label>
                <CurrencyInput value={reqForm.valor} onValueChange={(v) => setReqForm((f) => ({ ...f, valor: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Textarea value={reqForm.obs} onChange={(e) => setReqForm((f) => ({ ...f, obs: e.target.value }))} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReqDialog({ open: false, sale: null })}>Cancelar</Button>
            <Button
              disabled={createMut.isPending || !reqForm.valor}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon, label, value, hint, accent, warn, premium,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string;
  accent?: boolean; warn?: boolean; premium?: boolean;
}) {
  return (
    <div className={`glass-card p-4 ${accent ? "ring-1 ring-primary/30" : ""} ${warn ? "ring-1 ring-amber-400/30" : ""} ${premium ? "ring-1 ring-violet-400/30" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-xl mt-1 truncate">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
