import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  Line,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { fmtBRL, fmtBRLCompact, fmtNum } from "@/lib/format";
import {
  DollarSign, ShoppingBag, Trophy, Building2, Target, TrendingUp, TrendingDown,
  Users, Award, Filter, CalendarDays, CircleDot,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { isHouse } from "@/lib/team";

export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

interface Sale {
  id: string;
  data: string | null;
  empreendimento: string | null;
  valor_venda: number | null;
  corretor: string | null;
  gerente: string | null;
  comissao_bruta: number | null;
  comissao_liq_corretor: number | null;
  comissao_ger_bruta: number | null;
  status: string | null;
}

const COLORS = ["#2DE2C9", "#D6AF55", "#4D8DFF", "#FF5C8A", "#9A7CFF", "#6EE7B7", "#F97316", "#38BDF8"];

const SHEET_STATUS_OPTIONS = ["RESERVADO", "VENDIDO", "Liberado", "Pago", "Distrato"];

const STATUS_COLORS: Record<string, string> = {
  "Em aberto": "#D6AF55",
  "RESERVADO": "#4D8DFF",
  "VENDIDO": "#2DE2C9",
  "Liberado": "#6EE7B7",
  "Pago": "#2DE2C9",
  "Distrato": "#FF5C8A",
  "CANCELADO": "#FF5C8A",
  "DISTRATO": "#FF5C8A",
  "PAGO": "#2DE2C9",
};
const statusColor = (s: string) => STATUS_COLORS[s] ?? "#9A7CFF";

const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function Dashboard() {
  const { data: allSales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,data,empreendimento,valor_venda,corretor,gerente,comissao_bruta,comissao_liq_corretor,comissao_ger_bruta,status")
        .order("data", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
    refetchInterval: 60_000,
  });

  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const { data } = await supabase.from("config_kv").select("key,value");
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.key] = Number(r.value);
      return map;
    },
  });

  // ── Filtros ───────────────────────────────────────────────
  const years = useMemo(() => {
    const set = new Set<number>();
    allSales.forEach((s) => s.data && set.add(new Date(s.data).getUTCFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [allSales]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    SHEET_STATUS_OPTIONS.forEach((s) => set.add(s));
    allSales.forEach((s) => s.status && set.add(s.status));
    return Array.from(set);
  }, [allSales]);

  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getUTCFullYear()));
  const [month, setMonth] = useState<string>(String(now.getUTCMonth() + 1));
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [hideBruta, setHideBruta] = useState<boolean>(true);
  const [hideGerente, setHideGerente] = useState<boolean>(true);
  const [hideLiq, setHideLiq] = useState<boolean>(true);
  const [growthPeriod, setGrowthPeriod] = useState<"month" | "quarter" | "semester" | "year">("month");
  const [teamFilter, setTeamFilter] = useState<"all" | "house" | "imob">("all");
  const toggleStatus = (s: string) =>
    setActiveStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const sales = useMemo(() => {
    return allSales.filter((s) => {
      if (!s.data) return year === "all" && month === "all";
      const d = new Date(s.data);
      if (year !== "all" && d.getUTCFullYear() !== Number(year)) return false;
      if (month !== "all" && d.getUTCMonth() + 1 !== Number(month)) return false;
      if (activeStatuses.length > 0 && !activeStatuses.includes(s.status ?? "")) return false;
      if (teamFilter !== "all") {
        const house = isHouse(s.corretor);
        if (teamFilter === "house" && !house) return false;
        if (teamFilter === "imob" && house) return false;
      }
      return true;
    });
  }, [allSales, year, month, activeStatuses, teamFilter]);

  // ── Crescimento por período (ancorado no filtro de Ano/Mês) ──
  const periodGrowth = useMemo(() => {
    const today = new Date();
    // Referência: usa filtro selecionado; se "Todos", usa hoje.
    const refY = year !== "all" ? Number(year) : today.getUTCFullYear();
    const refM =
      month !== "all"
        ? Number(month) - 1
        : year !== "all"
          ? 11 // ano selecionado, mês = "todos" → ancora no fim do ano
          : today.getUTCMonth();
    let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date, label: string;
    if (growthPeriod === "month") {
      curStart = new Date(Date.UTC(refY, refM, 1));
      curEnd = new Date(Date.UTC(refY, refM + 1, 1));
      prevStart = new Date(Date.UTC(refY, refM - 1, 1));
      prevEnd = curStart;
      label = "vs mês anterior";
    } else if (growthPeriod === "quarter") {
      const q = Math.floor(refM / 3);
      curStart = new Date(Date.UTC(refY, q * 3, 1));
      curEnd = new Date(Date.UTC(refY, q * 3 + 3, 1));
      prevStart = new Date(Date.UTC(refY, q * 3 - 3, 1));
      prevEnd = curStart;
      label = "vs trimestre anterior";
    } else if (growthPeriod === "semester") {
      const sem = refM < 6 ? 0 : 1;
      curStart = new Date(Date.UTC(refY, sem * 6, 1));
      curEnd = new Date(Date.UTC(refY, sem * 6 + 6, 1));
      prevStart = new Date(Date.UTC(refY, sem * 6 - 6, 1));
      prevEnd = curStart;
      label = "vs semestre anterior";
    } else {
      curStart = new Date(Date.UTC(refY, 0, 1));
      curEnd = new Date(Date.UTC(refY + 1, 0, 1));
      prevStart = new Date(Date.UTC(refY - 1, 0, 1));
      prevEnd = curStart;
      label = "vs ano anterior";
    }
    let cur = 0, prev = 0;
    for (const s of allSales) {
      if (!s.data) continue;
      const d = new Date(s.data);
      const v = s.valor_venda ?? 0;
      if (d >= curStart && d < curEnd) cur += v;
      else if (d >= prevStart && d < prevEnd) prev += v;
    }
    const g = prev > 0 ? (cur - prev) / prev : cur > 0 ? 1 : 0;
    return { g, label, cur, prev };
  }, [allSales, growthPeriod, year, month]);

  // ── Métricas ──────────────────────────────────────────────
  const m = useMemo(() => {
    const vgv = sales.reduce((s, x) => s + (x.valor_venda ?? 0), 0);
    const com = sales.reduce((s, x) => s + (x.comissao_bruta ?? 0), 0);
    const comGer = sales.reduce((s, x) => s + (x.comissao_ger_bruta ?? 0), 0);
    const comLiq = sales.reduce((s, x) => s + (x.comissao_liq_corretor ?? 0), 0);
    const ticket = sales.length ? vgv / sales.length : 0;

    const byCorretor = group(sales, "corretor");
    const byGerente = group(sales, "gerente");
    const byEmp = group(sales, "empreendimento");
    const byMonth = groupByMonth(sales);
    const byStatus = groupByStatus(sales);

    const topC = top(byCorretor);
    const topG = top(byGerente);
    const topE = top(byEmp);

    const months = Object.keys(byMonth).sort();
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    const growth =
      cur && prev && byMonth[prev].vgv > 0
        ? (byMonth[cur].vgv - byMonth[prev].vgv) / byMonth[prev].vgv
        : 0;

    return { vgv, com, comGer, comGerGeral: vgv * 0.004, comLiq, ticket, topC, topG, topE, growth,
      byCorretor, byGerente, byEmp, byMonth, byStatus, months };
  }, [sales]);

  // Meta: soma RESERVADO + VENDIDO, subtrai DISTRATO/CANCELADO
  const metaVgv = 5_000_000;
  const metaRealizado = useMemo(() => {
    let total = 0;
    for (const s of sales) {
      const st = (s.status ?? "").toUpperCase();
      const v = s.valor_venda ?? 0;
      if (st === "RESERVADO" || st === "VENDIDO") total += v;
      else if (st === "DISTRATO" || st === "CANCELADO") total -= v;
    }
    return total;
  }, [sales]);
  const realPct = Math.min(1.5, metaRealizado / metaVgv);
  const metaDelta = metaRealizado / metaVgv - 1;
  const metaOnTrack = realPct >= 1;

  const corretorRanking = Object.entries(m.byCorretor)
    .map(([name, v]) => ({ name, vgv: v.vgv, count: v.count, com: v.com }))
    .sort((a, b) => b.vgv - a.vgv).slice(0, 8);

  const empData = Object.entries(m.byEmp)
    .map(([name, v]) => ({ name, value: v.vgv, count: v.count }))
    .sort((a, b) => b.value - a.value);

  const monthSeries = m.months.map((k) => ({
    mes: prettyMonth(k),
    vgv: m.byMonth[k].vgv,
    com: m.byMonth[k].com,
    vendas: m.byMonth[k].count,
  }));

  const statusData = Object.entries(m.byStatus)
    .map(([name, v]) => ({ name, value: v.vgv, count: v.count, com: v.com }))
    .sort((a, b) => b.value - a.value);

  const totalCount = sales.length || 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-primary pulse-dot" />
            </span>
            Dashboard Executivo · ao vivo
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
            <span className="text-gradient-primary">Visão Geral de Vendas</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sales.length === 0 && !isLoading
              ? "Nenhuma venda no recorte atual."
              : `${fmtNum(sales.length)} vendas · ${fmtBRLCompact(m.vgv)} em VGV`}
          </p>
        </div>
      </header>

      {/* Barra de Filtros */}
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

        <div className="flex items-center gap-2 flex-wrap">
          <CircleDot className="w-4 h-4 text-muted-foreground" />
          <StatusChip active={activeStatuses.length === 0} onClick={() => setActiveStatuses([])} label="Todos" color="#9ca3af" />
          {statuses.map((s) => (
            <StatusChip key={s} active={activeStatuses.includes(s)} onClick={() => toggleStatus(s)} label={s} color={statusColor(s)} />
          ))}
        </div>

        {(year !== "all" || month !== "all" || activeStatuses.length > 0) && (
          <Button variant="ghost" size="sm" className="ml-auto h-8"
            onClick={() => { setYear("all"); setMonth("all"); setActiveStatuses([]); }}>
            Limpar
          </Button>
        )}
      </motion.section>

      {/* KPIs principais */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="VGV Total" value={m.vgv} format={fmtBRLCompact} accent="teal" icon={<DollarSign className="w-4 h-4" />} index={0} />
        <KPICard label="Vendas" value={sales.length} format={fmtNum} accent="azure" icon={<ShoppingBag className="w-4 h-4" />} index={1} />
        <KPICard label="Ticket Médio" value={m.ticket} format={fmtBRLCompact} accent="gold" icon={<TrendingUp className="w-4 h-4" />} index={2} />
        <KPICard
          label="Crescimento"
          value={`${(periodGrowth.g * 100).toFixed(1)}%`}
          delta={periodGrowth.g}
          hint={`${periodGrowth.label} · ${fmtBRLCompact(periodGrowth.cur)} vs ${fmtBRLCompact(periodGrowth.prev)}`}
          accent={periodGrowth.g >= 0 ? "teal" : "gold"}
          icon={<TrendingUp className="w-4 h-4" />}
          index={3}
          extra={
            <div className="flex flex-wrap gap-1">
              {([
                ["month", "Mensal"],
                ["quarter", "Trimestre"],
                ["semester", "Semestre"],
                ["year", "Anual"],
              ] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setGrowthPeriod(k)}
                  className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border transition ${
                    growthPeriod === k
                      ? "bg-primary/15 border-primary/50 text-foreground"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          }
        />
        <KPICard
          label="Comissão Bruta"
          value={m.com + m.comGerGeral}
          format={fmtBRLCompact}
          hint="inclui 0,4% do gerente geral sobre VGV"
          accent="teal"
          icon={<Award className="w-4 h-4" />}
          index={4}
          hidden={hideBruta}
          onToggleHidden={() => setHideBruta((v) => !v)}
        />
        <KPICard
          label="Comissão Gerente"
          value={m.comGer}
          format={fmtBRLCompact}
          accent="azure"
          icon={<Award className="w-4 h-4" />}
          index={5}
          hidden={hideGerente}
          onToggleHidden={() => setHideGerente((v) => !v)}
        />
        <KPICard
          label="Comissão Líq. Corretor"
          value={m.comLiq}
          format={fmtBRLCompact}
          accent="gold"
          icon={<Award className="w-4 h-4" />}
          index={6}
          hidden={hideLiq}
          onToggleHidden={() => setHideLiq((v) => !v)}
        />
        <KPICard
          label="Meta atingida"
          value={`${(realPct * 100).toFixed(1)}%`}
          delta={metaDelta}
          hint={`Meta ${fmtBRLCompact(metaVgv)} · ${metaOnTrack ? "acima" : "abaixo"} ${(Math.abs(metaDelta) * 100).toFixed(1)}%`}
          accent={metaOnTrack ? "teal" : "gold"}
          icon={<Target className="w-4 h-4" />}
          index={7}
        />
      </section>


      {/* Status — visão dedicada */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Distribuição por Status" subtitle="VGV por situação da venda" delay={0.05}>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <defs>
                  {statusData.map((s, i) => (
                    <radialGradient key={i} id={`gradStatus-${i}`}>
                      <stop offset="0%" stopColor={statusColor(s.name)} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={statusColor(s.name)} stopOpacity={0.55} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie
                  data={statusData} dataKey="value" nameKey="name"
                  innerRadius="58%" outerRadius="88%" paddingAngle={4}
                  isAnimationActive animationBegin={100} animationDuration={1100}
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={`url(#gradStatus-${i})`} stroke="rgba(0,0,0,0.2)" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
          {statusData.map((s, i) => {
            const pct = s.count / totalCount;
            return (
              <motion.button
                key={s.name}
                layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                onClick={() => toggleStatus(s.name)}
                className={`glass-card p-5 text-left relative overflow-hidden group ${activeStatuses.includes(s.name) ? "ring-2 ring-primary/60" : ""}`}
              >
                <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl group-hover:opacity-50 transition-opacity"
                  style={{ background: statusColor(s.name) }} />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 flex items-center justify-center opacity-[0.08] group-hover:opacity-[0.14] transition-opacity"
                  style={{ color: statusColor(s.name) }}>
                  <ShoppingBag className="w-36 h-36" strokeWidth={1} />
                </div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex w-2.5 h-2.5">
                      <span className="absolute inset-0 rounded-full pulse-dot" style={{ background: statusColor(s.name) }} />
                    </span>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">{s.name}</span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: statusColor(s.name) }}>
                    {(pct * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="font-display text-2xl font-semibold tracking-tight">{fmtBRLCompact(s.value)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtNum(s.count)} vendas · comissão {fmtBRLCompact(s.com)}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${statusColor(s.name)}, ${statusColor(s.name)}aa)` }}
                  />
                </div>
              </motion.button>
            );
          })}
          </AnimatePresence>
        </div>
      </section>

      {/* Top destaques */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Melhor corretor" value={m.topC?.name ?? "—"} hint={`${fmtBRL(m.topC?.vgv ?? 0)} · ${m.topC ? (isHouse(m.topC.name) ? "Equipe House" : "Parceiro") : "—"}`} accent="teal" icon={<Trophy className="w-4 h-4" />} index={0} />
        <KPICard label="Melhor gerente" value={m.topG?.name ?? "—"} hint={fmtBRL(m.topG?.vgv ?? 0)} accent="azure" icon={<Users className="w-4 h-4" />} index={1} />
        <KPICard label="Melhor empreendimento" value={m.topE?.name ?? "—"} hint={fmtBRL(m.topE?.vgv ?? 0)} accent="gold" icon={<Building2 className="w-4 h-4" />} index={2} />
      </section>

      {/* Evolução + Meta */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Evolução de VGV & Comissões" subtitle="Por mês" className="lg:col-span-2" delay={0.05}>
          <div className="h-80">
            <ResponsiveContainer>
              <ComposedChart data={monthSeries}>
                <defs>
                  <linearGradient id="vgvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15CAB6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#15CAB6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="comStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F6B53D" />
                    <stop offset="100%" stopColor="#FFA94D" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mes" stroke="rgba(255,255,255,0.5)" fontSize={11} />
                <YAxis yAxisId="l" stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={fmtBRLCompact} />
                <YAxis yAxisId="r" orientation="right" stroke="rgba(255,255,255,0.3)" fontSize={11} tickFormatter={fmtBRLCompact} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                <Area yAxisId="l" type="monotone" dataKey="vgv" name="VGV"
                  stroke="#15CAB6" strokeWidth={2.5} fill="url(#vgvFill)"
                  isAnimationActive animationDuration={1300}
                  activeDot={{ r: 6, fill: "#15CAB6", stroke: "#fff", strokeWidth: 2, className: "glow-breathe" }}
                />
                <Line yAxisId="r" type="monotone" dataKey="com" name="Comissão"
                  stroke="url(#comStroke)" strokeWidth={2.5} dot={{ r: 3, fill: "#F6B53D" }}
                  isAnimationActive animationDuration={1300} animationBegin={300}
                  activeDot={{ r: 6, fill: "#F6B53D", stroke: "#fff", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Meta vs Realizado" subtitle={`${(realPct * 100).toFixed(1)}% da meta · ${metaOnTrack ? "acima" : "abaixo"}`} delay={0.1}>
          <div className="h-80 relative flex items-center justify-center">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="62%" outerRadius="100%"
                data={[{ name: "Meta", value: realPct * 100, fill: metaOnTrack ? "url(#radGradPos)" : "url(#radGradNeg)" }]}
                startAngle={210} endAngle={-30}
              >
                <defs>
                  <linearGradient id="radGradPos" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#15CAB6" />
                    <stop offset="100%" stopColor="#6EE7B7" />
                  </linearGradient>
                  <linearGradient id="radGradNeg" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F6B53D" />
                    <stop offset="100%" stopColor="#FF5C8A" />
                  </linearGradient>
                </defs>
                <RadialBar dataKey="value" cornerRadius={20}
                  background={{ fill: "rgba(255,255,255,0.05)" }}
                  isAnimationActive animationDuration={1400}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className={`font-display text-4xl font-semibold glow-breathe ${metaOnTrack ? "text-gradient-primary" : "text-gradient-gold"}`}>
                {(realPct * 100).toFixed(1)}%
              </div>
              <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${metaOnTrack ? "text-success" : "text-destructive"}`}>
                {metaOnTrack ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {metaOnTrack ? "+" : ""}{(metaDelta * 100).toFixed(1)}% vs meta
              </div>
              <div className="text-xs text-muted-foreground mt-1">{fmtBRLCompact(metaRealizado)} de {fmtBRLCompact(metaVgv)}</div>
            </div>
          </div>
        </ChartCard>
      </section>

      {/* Ranking + Empreendimentos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Ranking de corretores" subtitle="Top 8 por VGV" delay={0.05}>
          <div className="h-96">
            <ResponsiveContainer>
              <BarChart data={corretorRanking} layout="vertical" margin={{ left: 10 }}>
                <defs>
                  {corretorRanking.map((_, i) => (
                    <linearGradient key={i} id={`barC-${i}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={fmtBRLCompact} />
                <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.7)" fontSize={11} width={110} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="vgv" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={1100}>
                  {corretorRanking.map((_, i) => (
                    <Cell key={i} fill={`url(#barC-${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Vendas por empreendimento" subtitle={`${empData.length} empreendimentos no recorte`} delay={0.1}>
          <div className="h-96">
            <ResponsiveContainer>
              <PieChart>
                <defs>
                  {empData.map((_, i) => (
                    <radialGradient key={i} id={`gradEmp-${i}`}>
                      <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.5} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie data={empData} dataKey="value" nameKey="name"
                  innerRadius="55%" outerRadius="88%" paddingAngle={3}
                  isAnimationActive animationDuration={1200}
                >
                  {empData.map((_, i) => (
                    <Cell key={i} fill={`url(#gradEmp-${i})`} stroke="rgba(0,0,0,0.2)" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

function StatusChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-all ${
        active
          ? "bg-primary/15 border-primary/50 text-foreground shadow-[0_0_0_3px_rgba(21,202,182,0.08)]"
          : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </button>
  );
}

function group(sales: Sale[], key: "corretor" | "gerente" | "empreendimento") {
  const out: Record<string, { vgv: number; count: number; com: number }> = {};
  for (const s of sales) {
    const k = (s[key] ?? "—").toString();
    if (!out[k]) out[k] = { vgv: 0, count: 0, com: 0 };
    out[k].vgv += s.valor_venda ?? 0;
    out[k].count += 1;
    out[k].com += s.comissao_bruta ?? 0;
  }
  return out;
}

function groupByMonth(sales: Sale[]) {
  const out: Record<string, { vgv: number; count: number; com: number }> = {};
  for (const s of sales) {
    if (!s.data) continue;
    const k = s.data.slice(0, 7);
    if (!out[k]) out[k] = { vgv: 0, count: 0, com: 0 };
    out[k].vgv += s.valor_venda ?? 0;
    out[k].count += 1;
    out[k].com += s.comissao_bruta ?? 0;
  }
  return out;
}

function groupByStatus(sales: Sale[]) {
  const out: Record<string, { vgv: number; count: number; com: number }> = {};
  for (const s of sales) {
    const k = s.status ?? "Sem status";
    if (!out[k]) out[k] = { vgv: 0, count: 0, com: 0 };
    out[k].vgv += s.valor_venda ?? 0;
    out[k].count += 1;
    out[k].com += s.comissao_bruta ?? 0;
  }
  return out;
}

function top(map: Record<string, { vgv: number; count: number }>) {
  let best: { name: string; vgv: number } | null = null;
  for (const [name, v] of Object.entries(map)) {
    if (name === "—") continue;
    if (!best || v.vgv > best.vgv) best = { name, vgv: v.vgv };
  }
  return best;
}

function prettyMonth(k: string) {
  const [y, mm] = k.split("-");
  return `${MESES_PT[Number(mm) - 1]}/${y.slice(2)}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color?: string; payload?: { count?: number } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-xs min-w-32">
      {label && <div className="text-muted-foreground mb-1.5">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium ml-auto">{fmtBRL(p.value)}</span>
        </div>
      ))}
      {payload[0]?.payload?.count != null && (
        <div className="mt-1 pt-1 border-t border-border text-muted-foreground">
          {payload[0].payload.count} vendas
        </div>
      )}
    </div>
  );
}
