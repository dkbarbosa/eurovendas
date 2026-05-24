import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  listMyTeam, setTeamMember,
} from "@/lib/team.functions";
import {
  getGerenteOverview, listDistinctGerentes,
} from "@/lib/gerente.functions";
import { useAuth } from "@/lib/auth";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useAgendamentos } from "@/hooks/use-agendamentos";
import { parseAgendamento } from "@/lib/agendamentos-parse";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { fmtBRL, fmtBRLCompact, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, DollarSign, ShoppingBag, TrendingUp, Trophy, Building2, Award,
  CalendarDays, Filter, CircleDot, Users, UserPlus, UserMinus, Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: Page,
  head: () => ({ meta: [{ title: "Dashboard Gerência · Gestão Comercial" }] }),
});

const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const COLORS = ["#2DE2C9", "#D6AF55", "#4D8DFF", "#FF5C8A", "#9A7CFF", "#6EE7B7", "#F97316", "#38BDF8"];

const STATUS_COLORS: Record<string, string> = {
  "RESERVADO": "#4D8DFF",
  "ASSINADO": "#9A7CFF",
  "CAIXA": "#6EE7B7",
  "PAGO": "#2DE2C9",
  "VENDIDO": "#2DE2C9",
  "DISTRATO": "#FF5C8A",
  "CANCELADO": "#FF5C8A",
};
const statusColor = (s: string) => STATUS_COLORS[s.toUpperCase()] ?? "#9A7CFF";

const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

function Page() {
  const { isAdmin, isGerente } = useAuth();
  const [adminPick, setAdminPick] = usePersistentState<string | undefined>("equipe:adminPick", undefined);

  const fnList = useServerFn(listDistinctGerentes);
  const fnOverview = useServerFn(getGerenteOverview);

  const { data: gerentesList = [] } = useQuery({
    queryKey: ["distinct-gerentes"],
    queryFn: () => fnList(),
    enabled: isAdmin,
  });

  const overviewArg = isAdmin ? adminPick : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["gerente-overview", overviewArg],
    queryFn: () => fnOverview({ data: overviewArg ? { gerente_nome: overviewArg } : undefined }),
    refetchInterval: 30_000,
  });

  const sales = data?.sales ?? [];
  const gerenteNome = data?.gerenteNome ?? null;

  // Filtros
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getUTCFullYear()));
  const [month, setMonth] = useState<string>(String(now.getUTCMonth() + 1));
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [corretorFilter, setCorretorFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [growthPeriod, setGrowthPeriod] = useState<"quarter" | "semester" | "year">("quarter");

  const years = useMemo(() => {
    const set = new Set<number>();
    sales.forEach((s) => s.data && set.add(new Date(s.data).getUTCFullYear()));
    if (set.size === 0) set.add(now.getUTCFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [sales, now]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    ["RESERVADO","ASSINADO","CAIXA","PAGO","DISTRATO"].forEach((s) => set.add(s));
    sales.forEach((s) => s.status && set.add(s.status));
    return Array.from(set);
  }, [sales]);

  const corretores = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => s.corretor && set.add(s.corretor));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (!s.data && (year !== "all" || month !== "all")) return false;
      if (s.data) {
        const d = new Date(s.data);
        if (year !== "all" && d.getUTCFullYear() !== Number(year)) return false;
        if (month !== "all" && d.getUTCMonth() + 1 !== Number(month)) return false;
      }
      if (activeStatuses.length > 0 && !activeStatuses.map(x => x.toUpperCase()).includes((s.status ?? "").toUpperCase())) return false;
      if (corretorFilter !== "all" && (s.corretor ?? "") !== corretorFilter) return false;
      if (q && !`${s.comprador ?? ""} ${s.empreendimento ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sales, year, month, activeStatuses, corretorFilter, search]);

  // KPIs
  const k = useMemo(() => {
    let vgv = 0, vendasCount = 0, comGer = 0, comCorr = 0, distratos = 0;
    for (const s of filtered) {
      const st = (s.status ?? "").toUpperCase().trim();
      if (st.includes("DISTRATO") || st.includes("CANCEL")) { distratos += 1; continue; }
      vgv += Number(s.valor_venda) || 0;
      vendasCount += 1;
      comGer += Number(s.comissao_liq_gerente) || 0;
      comCorr += Number(s.comissao_liq_corretor) || 0;
    }
    const ticket = vendasCount > 0 ? vgv / vendasCount : 0;
    return { vgv, vendasCount, comGer, comCorr, ticket, distratos };
  }, [filtered]);

  // Crescimento por período (trimestre / semestre / anual) — compara VGV do período atual com o anterior
  const growth = useMemo(() => {
    const td = new Date();
    const y = td.getUTCFullYear();
    const mo = td.getUTCMonth();
    let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date, label: string;
    if (growthPeriod === "quarter") {
      const q = Math.floor(mo / 3);
      curStart = new Date(Date.UTC(y, q * 3, 1));
      curEnd = new Date(Date.UTC(y, q * 3 + 3, 1));
      prevStart = new Date(Date.UTC(y, q * 3 - 3, 1));
      prevEnd = curStart;
      label = `T${q + 1}/${y}`;
    } else if (growthPeriod === "semester") {
      const s = mo < 6 ? 0 : 1;
      curStart = new Date(Date.UTC(y, s * 6, 1));
      curEnd = new Date(Date.UTC(y, s * 6 + 6, 1));
      prevStart = new Date(Date.UTC(y, s * 6 - 6, 1));
      prevEnd = curStart;
      label = `${s === 0 ? "1º" : "2º"} sem/${y}`;
    } else {
      curStart = new Date(Date.UTC(y, 0, 1));
      curEnd = new Date(Date.UTC(y + 1, 0, 1));
      prevStart = new Date(Date.UTC(y - 1, 0, 1));
      prevEnd = curStart;
      label = `${y}`;
    }
    let cur = 0, prev = 0, curN = 0, prevN = 0;
    for (const s of sales) {
      if (!s.data) continue;
      const st = (s.status ?? "").toUpperCase().trim();
      if (st.includes("DISTRATO") || st.includes("CANCEL")) continue;
      const d = new Date(s.data);
      const v = Number(s.valor_venda) || 0;
      if (d >= curStart && d < curEnd) { cur += v; curN += 1; }
      else if (d >= prevStart && d < prevEnd) { prev += v; prevN += 1; }
    }
    const pct = prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : null);
    return { cur, prev, curN, prevN, pct, label };
  }, [sales, growthPeriod]);


  // Séries
  const byMonth = useMemo(() => {
    const map = new Map<string, { mes: string; vgv: number; vendas: number; comGer: number }>();
    for (const s of filtered) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vgv: 0, vendas: 0, comGer: 0 };
      cur.vgv += Number(s.valor_venda) || 0;
      cur.vendas += 1;
      cur.comGer += Number(s.comissao_liq_gerente) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map((r) => {
      const [y, mo] = r.mes.split("-");
      return { ...r, label: `${MESES_PT[Number(mo) - 1] ?? mo}/${y.slice(2)}` };
    });
  }, [filtered]);

  const byCorretor = useMemo(() => {
    const m = new Map<string, { name: string; vgv: number; vendas: number; comCorr: number; comGer: number }>();
    for (const s of filtered) {
      const nome = s.corretor ?? "—";
      const cur = m.get(nome) ?? { name: nome, vgv: 0, vendas: 0, comCorr: 0, comGer: 0 };
      cur.vgv += Number(s.valor_venda) || 0;
      cur.vendas += 1;
      cur.comCorr += Number(s.comissao_liq_corretor) || 0;
      cur.comGer += Number(s.comissao_liq_gerente) || 0;
      m.set(nome, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.vgv - a.vgv);
  }, [filtered]);

  const byEmp = useMemo(() => {
    const m = new Map<string, { name: string; value: number; count: number }>();
    for (const s of filtered) {
      const nome = s.empreendimento ?? "—";
      const cur = m.get(nome) ?? { name: nome, value: 0, count: 0 };
      cur.value += Number(s.valor_venda) || 0;
      cur.count += 1;
      m.set(nome, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of filtered) {
      const st = (s.status ?? "—").toUpperCase();
      m.set(st, (m.get(st) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const topCorretor = byCorretor[0];

  // Agendamentos da equipe (Google Calendar)
  const { data: events = [], isLoading: agLoading } = useAgendamentos();
  const corretoresSet = useMemo(() => new Set(corretores.map((c) => c.toLowerCase())), [corretores]);
  const teamEvents = useMemo(() => {
    const list = events.map((e) => {
      const parsed = parseAgendamento(e.summary ?? "", e.description, e.creatorEmail, corretores);
      return { ...e, broker: parsed.broker, cliente: parsed.cliente };
    }).filter((e) => {
      if (!e.broker) return false;
      return corretoresSet.has(e.broker.toLowerCase());
    });
    return list.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  }, [events, corretores, corretoresSet]);

  const upcomingAg = useMemo(() => {
    const today = new Date().toISOString();
    return teamEvents.filter((e) => (e.start ?? "") >= today).slice(0, 12);
  }, [teamEvents]);

  const agByBroker = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of teamEvents) {
      const b = e.broker ?? "—";
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [teamEvents]);

  if (!isAdmin && !isGerente) return <div className="text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-primary pulse-dot" />
            </span>
            Dashboard Gerência · ao vivo
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
            <span className="text-gradient-primary">Visão da Equipe</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerente: <b className="text-foreground">{gerenteNome ?? (isAdmin ? "—" : "Sem vínculo")}</b>
            {" · "}
            {filtered.length === 0 && !isLoading
              ? "Sem vendas no recorte atual."
              : `${fmtNum(filtered.length)} vendas · ${fmtBRLCompact(k.vgv)} em VGV`}
          </p>
        </div>
        {isAdmin && (
          <div className="min-w-[260px]">
            <Label className="text-xs">Ver como gerente</Label>
            <Select value={adminPick ?? ""} onValueChange={(v) => setAdminPick(v || undefined)}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {gerentesList.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </header>

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
          {/* Filtros */}
          <motion.section
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="glass-card p-4 flex flex-wrap items-center gap-3"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground pr-2 border-r border-border">
              <Filter className="w-3.5 h-3.5" /> Filtros
            </div>

            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os anos</SelectItem>
                  {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {MESES_PT.map((nm, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{nm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Select value={corretorFilter} onValueChange={setCorretorFilter}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Corretor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos corretores</SelectItem>
                  {corretores.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-2 flex-wrap">
              <CircleDot className="w-4 h-4 text-muted-foreground" />
              <StatusChip active={activeStatuses.length === 0} onClick={() => setActiveStatuses([])} label="Todos" color="#9ca3af" />
              {statuses.map((s) => (
                <StatusChip
                  key={s}
                  active={activeStatuses.includes(s)}
                  onClick={() =>
                    setActiveStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
                  }
                  label={s}
                  color={statusColor(s)}
                />
              ))}
            </div>

            <div className="relative ml-auto">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 h-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente / empreend…" />
            </div>

            {(year !== String(now.getUTCFullYear()) || month !== "all" || activeStatuses.length > 0 || corretorFilter !== "all" || search) && (
              <Button variant="ghost" size="sm" className="h-8"
                onClick={() => { setYear(String(now.getUTCFullYear())); setMonth("all"); setActiveStatuses([]); setCorretorFilter("all"); setSearch(""); }}>
                Limpar
              </Button>
            )}
          </motion.section>

          {/* KPIs */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard label="VGV Total" value={k.vgv} format={fmtBRLCompact} accent="teal" icon={<DollarSign className="w-4 h-4" />} index={0} />
            <KPICard label="Vendas" value={k.vendasCount} format={fmtNum} accent="azure" icon={<ShoppingBag className="w-4 h-4" />} index={1} />
            <KPICard label="Ticket Médio" value={k.ticket} format={fmtBRLCompact} accent="gold" icon={<TrendingUp className="w-4 h-4" />} index={2} />
            <KPICard label="Comissão Gerente" value={k.comGer} format={fmtBRLCompact} accent="teal" icon={<Award className="w-4 h-4" />} index={3} />
            <KPICard label="Comissão Corretores" value={k.comCorr} format={fmtBRLCompact} accent="azure" icon={<Award className="w-4 h-4" />} index={4} />
            <KPICard label="Top Corretor" value={topCorretor?.name ?? "—"} accent="gold" icon={<Trophy className="w-4 h-4" />} index={5}
              hint={topCorretor ? `${fmtBRLCompact(topCorretor.vgv)} · ${topCorretor.vendas} vendas` : "—"} />
          </section>

          {/* Charts row 1 */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="VGV por mês" subtitle="Evolução das vendas" className="lg:col-span-2">
              <div className="h-72">
                <ResponsiveContainer>
                  <AreaChart data={byMonth} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqVgvArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2DE2C9" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#2DE2C9" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => fmtBRL(v)}
                      contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="vgv" stroke="#2DE2C9" strokeWidth={2} fill="url(#eqVgvArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Vendas por status" subtitle="Distribuição">
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                      {byStatus.map((entry, i) => (
                        <Cell key={i} fill={statusColor(entry.name)} stroke="oklch(0.12 0.02 270)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          {/* Charts row 2 */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Ranking de corretores" subtitle="Por VGV no período">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={byCorretor.slice(0, 8)} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => fmtBRL(v)}
                      contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="vgv" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      {byCorretor.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="VGV por empreendimento" subtitle="Top 6 do período">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={byEmp.slice(0, 6)} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => fmtBRL(v)}
                      contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {byEmp.slice(0, 6).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          {/* Tabs: Equipe + Agendamentos */}
          <Tabs defaultValue="agendamentos" className="w-full">
            <TabsList className="grid grid-cols-3 w-full md:w-auto">
              <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
              <TabsTrigger value="ranking">Ranking detalhado</TabsTrigger>
              <TabsTrigger value="time">Gerenciar equipe</TabsTrigger>
            </TabsList>

            <TabsContent value="agendamentos" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="Visitas por corretor" subtitle="Agenda Google · Maicon" className="lg:col-span-1">
                  <div className="h-72">
                    {agLoading ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando agenda…</div>
                    ) : agByBroker.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem agendamentos para a equipe.</div>
                    ) : (
                      <ResponsiveContainer>
                        <BarChart data={agByBroker} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                          <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11, fill: "oklch(0.78 0.02 270)" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }} />
                          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20}>
                            {agByBroker.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </ChartCard>

                <div className="glass-card p-4 lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-lg">Próximos agendamentos</h3>
                    <span className="text-xs text-muted-foreground">{upcomingAg.length} eventos</span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {upcomingAg.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-12">Sem visitas agendadas para a equipe.</div>
                    )}
                    {upcomingAg.map((e) => (
                      <a key={e.id} href={e.htmlLink ?? "#"} target="_blank" rel="noreferrer"
                        className="block p-3 rounded-lg border border-border/60 bg-secondary/20 hover:bg-secondary/40 transition">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">{e.summary || "(sem título)"}</div>
                          <Badge variant="outline" className="text-[10px]">{e.broker}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />
                            {e.start ? new Date(e.start).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </span>
                          {e.cliente && <span>Cliente: <b className="text-foreground">{e.cliente}</b></span>}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ranking" className="space-y-3 mt-4">
              <div className="glass-card p-2 overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Corretor</th>
                      <th className="text-right p-3">Vendas</th>
                      <th className="text-right p-3">VGV</th>
                      <th className="text-right p-3">Com. Corretor</th>
                      <th className="text-right p-3">Com. Gerente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCorretor.map((e, i) => (
                      <tr key={e.name} className="border-t border-border">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{e.name}</td>
                        <td className="p-3 text-right tabular-nums">{e.vendas}</td>
                        <td className="p-3 text-right tabular-nums">{fmtBRL(e.vgv)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtBRL(e.comCorr)}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{fmtBRL(e.comGer)}</td>
                      </tr>
                    ))}
                    {byCorretor.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="time" className="space-y-4 mt-4">
              <TeamManager />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatusChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition flex items-center gap-1.5 ${
        active ? "bg-primary/15 border-primary/50 text-foreground" : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </button>
  );
}

function TeamManager() {
  const { isGerente, isAdmin } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listMyTeam);
  const setMember = useServerFn(setTeamMember);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: () => list(),
    enabled: isGerente || isAdmin,
  });

  const mut = useMutation({
    mutationFn: (v: { corretor_user_id: string; link: boolean }) => setMember({ data: v }),
    onSuccess: () => { toast.success("Equipe atualizada."); qc.invalidateQueries({ queryKey: ["my-team"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>;

  const team = rows.filter((r) => r.linked);
  const available = rows.filter((r) => !r.linked);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Users className="w-4 h-4" />Minha equipe ({team.length})</div>
        {team.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">Nenhum corretor vinculado ainda.</div>
        ) : (
          <TeamTable rows={team} actionLabel="Desvincular" actionIcon={<UserMinus className="w-4 h-4" />}
            onAct={(id) => mut.mutate({ corretor_user_id: id, link: false })} disabled={mut.isPending} />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="w-4 h-4" />Disponíveis ({available.length})</div>
        {available.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">Todos os corretores já estão alocados.</div>
        ) : (
          <TeamTable rows={available} actionLabel="Adicionar" actionIcon={<UserPlus className="w-4 h-4" />}
            onAct={(id) => mut.mutate({ corretor_user_id: id, link: true })} disabled={mut.isPending} showOtherTeamFlag />
        )}
      </div>
    </div>
  );
}

type Row = {
  user_id: string; email: string | null; display_name: string | null;
  corretor_nome: string | null; linked: boolean; in_other_team: boolean;
};

function TeamTable({
  rows, actionLabel, actionIcon, onAct, disabled, showOtherTeamFlag,
}: {
  rows: Row[]; actionLabel: string; actionIcon: React.ReactNode;
  onAct: (id: string) => void; disabled: boolean; showOtherTeamFlag?: boolean;
}) {
  return (
    <div className="glass-card p-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Nome</th>
            <th className="text-left p-3">E-mail</th>
            <th className="text-left p-3">Nome na planilha</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t border-border">
              <td className="p-3 font-medium">{r.display_name ?? "—"}</td>
              <td className="p-3 text-muted-foreground">{r.email ?? "—"}</td>
              <td className="p-3">{r.corretor_nome ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="p-3 text-right">
                {showOtherTeamFlag && r.in_other_team && (
                  <span className="text-xs text-muted-foreground mr-3">em outra equipe</span>
                )}
                <Button size="sm" variant="outline" disabled={disabled || (showOtherTeamFlag && r.in_other_team)}
                  onClick={() => onAct(r.user_id)}>
                  {actionIcon}<span className="ml-2">{actionLabel}</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
