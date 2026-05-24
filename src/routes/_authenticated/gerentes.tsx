import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  getGerenteOverview,
  listDistinctGerentes,
  createGerenteCommissionRequest,
} from "@/lib/gerente.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Wallet, TrendingUp, Users, Receipt, Ban, Send, Search,
  CircleDollarSign, Trophy, Clock,
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
const lastDayOfMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

function GerentesPage() {
  const { isAdmin, isGerente } = useAuth();
  const qc = useQueryClient();

  const [adminPick, setAdminPick] = usePersistentState<string | undefined>(
    "gerentes:adminPick",
    undefined,
  );
  const [dateFrom, setDateFrom] = usePersistentState<string>("gerentes:from", firstDayOfMonth());
  const [dateTo, setDateTo] = usePersistentState<string>("gerentes:to", lastDayOfMonth());
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
  const gerenteNome = data?.gerenteNome ?? null;

  // ----- filtros aplicados -----
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const d = (s.data ?? "").slice(0, 10);
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo && d && d > dateTo) return false;
      if (q && !`${s.comprador ?? ""} ${s.empreendimento ?? ""}`.toLowerCase().includes(q)) return false;
      if (corretorFilter !== "all" && (s.corretor ?? "") !== corretorFilter) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, search, corretorFilter]);

  // ----- agregados -----
  const corretoresDaEquipe = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) if (s.corretor) set.add(s.corretor);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales]);

  const paidByReq = useMemo(() => {
    const m = new Map<string, number>(); // sale_id -> total pago do gerente
    for (const r of requests) {
      if (r.status === "pago") {
        m.set(r.sale_id, (m.get(r.sale_id) ?? 0) + (Number(r.valor_solicitado) || 0));
      }
    }
    return m;
  }, [requests]);

  const kpis = useMemo(() => {
    let vgv = 0;
    let comGerente = 0;
    let count = 0;
    for (const s of filteredSales) {
      const stUp = (s.status ?? "").trim().toUpperCase();
      if (stUp === "RESERVADO" || stUp === "DISTRATO") continue;
      vgv += Number(s.valor_venda) || 0;
      comGerente += Number(s.comissao_liq_gerente) || 0;
      count += 1;
    }
    let pago = 0;
    let pendValor = 0;
    let pendCount = 0;
    let aprovValor = 0;
    for (const r of requests) {
      const v = Number(r.valor_solicitado) || 0;
      if (r.status === "pago") pago += v;
      else if (r.status === "pendente") { pendValor += v; pendCount += 1; }
      else if (r.status === "aprovado") aprovValor += v;
    }
    const aReceber = Math.max(0, comGerente - pago);
    const distratosCount = distratos.length;
    const distratosImpacto = distratos.reduce(
      (s, d) => s + (Number(d.valor_comissao_gerente) || 0), 0,
    );
    return { vgv, comGerente, count, pago, pendValor, pendCount, aprovValor, aReceber, distratosCount, distratosImpacto };
  }, [filteredSales, requests, distratos]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; vendas: number; comissao: number; vgv: number }>();
    for (const s of filteredSales) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vendas: 0, comissao: 0, vgv: 0 };
      cur.vendas += 1;
      cur.comissao += Number(s.comissao_liq_gerente) || 0;
      cur.vgv += Number(s.valor_venda) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [filteredSales]);

  const equipeStats = useMemo(() => {
    const m = new Map<string, { corretor: string; vendas: number; vgv: number; comCorr: number; comGer: number }>();
    for (const s of filteredSales) {
      const nome = s.corretor ?? "—";
      const cur = m.get(nome) ?? { corretor: nome, vendas: 0, vgv: 0, comCorr: 0, comGer: 0 };
      cur.vendas += 1;
      cur.vgv += Number(s.valor_venda) || 0;
      cur.comCorr += Number(s.comissao_liq_corretor) || 0;
      cur.comGer += Number(s.comissao_liq_gerente) || 0;
      m.set(nome, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.vgv - a.vgv);
  }, [filteredSales]);

  // ----- diálogo de solicitação -----
  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: (typeof sales)[number] | null }>(
    { open: false, sale: null },
  );
  const [reqForm, setReqForm] = useState({
    tipo: "adiantamento" as "adiantamento" | "comissao_final",
    valor: null as number | null,
    obs: "",
  });
  const openReq = (s: (typeof sales)[number]) => {
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
          bonus: 0,
          observacao: reqForm.obs || undefined,
        },
      }),
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
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Painel do Gerente</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {gerenteNome ?? (isAdmin ? "Selecione um gerente" : "Sem vínculo de gerente")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Comissões, equipe, distratos e métricas do seu time.
            </p>
          </div>
          {isAdmin && (
            <div className="min-w-[260px]">
              <Label className="text-xs">Atuar como gerente</Label>
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
      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
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
        <div>
          <Label className="text-xs">Buscar (cliente/empreend.)</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
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
        <Tabs defaultValue="visao" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="visao">Visão Geral</TabsTrigger>
            <TabsTrigger value="comissao">Minha Comissão</TabsTrigger>
            <TabsTrigger value="pedidos">Solicitações</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
            <TabsTrigger value="distratos">Distratos</TabsTrigger>
          </TabsList>

          {/* --------- VISÃO GERAL --------- */}
          <TabsContent value="visao" className="space-y-6 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={<TrendingUp className="w-4 h-4" />} label="VGV do período" value={BRL(kpis.vgv)} sub={`${kpis.count} vendas`} />
              <Kpi icon={<CircleDollarSign className="w-4 h-4" />} label="Comissão (líq.)" value={BRL(kpis.comGerente)} />
              <Kpi icon={<Wallet className="w-4 h-4" />} label="A receber" value={BRL(kpis.aReceber)} sub={`Pago: ${BRL(kpis.pago)}`} />
              <Kpi icon={<Clock className="w-4 h-4" />} label="Pendente" value={BRL(kpis.pendValor)} sub={`${kpis.pendCount} pedido(s)`} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card p-4">
                <div className="text-sm font-medium mb-3">Comissão por mês</div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="mes" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => BRL(v)} />
                      <Bar dataKey="comissao" fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="text-sm font-medium mb-3">VGV por mês</div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="mes" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => BRL(v)} />
                      <Line dataKey="vgv" stroke="oklch(0.72 0.16 160)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* --------- MINHA COMISSÃO --------- */}
          <TabsContent value="comissao" className="space-y-3 mt-6">
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Empreend./Un.</th>
                    <th className="text-left p-3">Corretor</th>
                    <th className="text-right p-3">VGV</th>
                    <th className="text-right p-3">Com. Gerente</th>
                    <th className="text-right p-3">A receber</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => {
                    const comLiq = Number(s.comissao_liq_gerente) || 0;
                    const pago = paidByReq.get(s.id) ?? 0;
                    const aReceber = Math.max(0, comLiq - pago);
                    const stUp = (s.status ?? "").trim().toUpperCase();
                    const blocked = stUp === "RESERVADO" || stUp === "DISTRATO";
                    return (
                      <tr key={s.id} className="border-t border-border">
                        <td className="p-3">{fmtBR(s.data)}</td>
                        <td className="p-3 font-medium">{s.comprador ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">
                          {s.empreendimento ?? "—"} {s.unidade ? `· ${s.unidade}` : ""}
                        </td>
                        <td className="p-3">{s.corretor ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums">{BRL(s.valor_venda)}</td>
                        <td className="p-3 text-right tabular-nums">{BRL(comLiq)}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{BRL(aReceber)}</td>
                        <td className="p-3"><Badge variant="outline">{s.status ?? "—"}</Badge></td>
                        <td className="p-3 text-right">
                          <Button size="sm" disabled={blocked || aReceber <= 0} onClick={() => openReq(s)}>
                            <Send className="w-3 h-3 mr-1" /> Solicitar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSales.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma venda no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* --------- SOLICITAÇÕES --------- */}
          <TabsContent value="pedidos" className="space-y-3 mt-6">
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Criado</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-right p-3">Valor</th>
                    <th className="text-right p-3">Desc. distrato</th>
                    <th className="p-3">Status</th>
                    <th className="text-left p-3">Motivo / Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3">{fmtBR(r.created_at)}</td>
                      <td className="p-3">{r.tipo === "adiantamento" ? "Adiantamento" : "Comissão final"}</td>
                      <td className="p-3 text-right tabular-nums">{BRL(r.valor_solicitado)}</td>
                      <td className="p-3 text-right tabular-nums text-amber-500">
                        {Number(r.desconto_distrato) > 0 ? `- ${BRL(r.desconto_distrato)}` : "—"}
                      </td>
                      <td className="p-3"><StatusBadge status={r.status} /></td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {r.motivo_negacao ?? r.observacao_financeiro ?? r.observacao_corretor ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma solicitação ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* --------- EQUIPE --------- */}
          <TabsContent value="equipe" className="space-y-3 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Kpi icon={<Users className="w-4 h-4" />} label="Corretores" value={String(equipeStats.length)} />
              <Kpi icon={<Trophy className="w-4 h-4" />} label="Top VGV" value={equipeStats[0]?.corretor ?? "—"} sub={equipeStats[0] ? BRL(equipeStats[0].vgv) : ""} />
              <Kpi icon={<Receipt className="w-4 h-4" />} label="Comissão total equipe" value={BRL(equipeStats.reduce((s, e) => s + e.comCorr, 0))} />
            </div>
            <div className="glass-card p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Corretor</th>
                    <th className="text-right p-3">Vendas</th>
                    <th className="text-right p-3">VGV</th>
                    <th className="text-right p-3">Com. Corretor</th>
                    <th className="text-right p-3">Com. Gerente</th>
                  </tr>
                </thead>
                <tbody>
                  {equipeStats.map((e) => (
                    <tr key={e.corretor} className="border-t border-border">
                      <td className="p-3 font-medium">{e.corretor}</td>
                      <td className="p-3 text-right tabular-nums">{e.vendas}</td>
                      <td className="p-3 text-right tabular-nums">{BRL(e.vgv)}</td>
                      <td className="p-3 text-right tabular-nums">{BRL(e.comCorr)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{BRL(e.comGer)}</td>
                    </tr>
                  ))}
                  {equipeStats.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sem dados de equipe no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* --------- DISTRATOS --------- */}
          <TabsContent value="distratos" className="space-y-3 mt-6">
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
          </TabsContent>
        </Tabs>
      )}

      {/* Diálogo solicitação */}
      <Dialog open={reqDialog.open} onOpenChange={(open) => !open && setReqDialog({ open: false, sale: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar comissão (gerente)</DialogTitle>
          </DialogHeader>
          {reqDialog.sale && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <div><b>Cliente:</b> {reqDialog.sale.comprador}</div>
                <div><b>Empreend./Un.:</b> {reqDialog.sale.empreendimento} {reqDialog.sale.unidade ? `· ${reqDialog.sale.unidade}` : ""}</div>
                <div><b>Comissão líq. gerente:</b> {BRL(reqDialog.sale.comissao_liq_gerente)}</div>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={reqForm.tipo} onValueChange={(v) => setReqForm((f) => ({ ...f, tipo: v as "adiantamento" | "comissao_final" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="comissao_final">Comissão final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor solicitado</Label>
                <CurrencyInput value={reqForm.valor ?? 0} onChange={(v) => setReqForm((f) => ({ ...f, valor: v }))} />
              </div>
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea value={reqForm.obs} onChange={(e) => setReqForm((f) => ({ ...f, obs: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReqDialog({ open: false, sale: null })}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !reqForm.valor}>
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    aprovado: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    pago: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    negado: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    distratado: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}
