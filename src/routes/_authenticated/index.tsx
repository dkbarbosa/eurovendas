import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { fmtBRL, fmtBRLCompact, fmtNum } from "@/lib/format";
import { DollarSign, ShoppingBag, Trophy, Building2, Target, TrendingUp, Users, Award } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

interface Sale {
  id: string;
  data: string | null;
  empreendimento: string | null;
  valor_venda: number | null;
  corretor: string | null;
  gerente: string | null;
  comissao_bruta: number | null;
  comissao_liq_corretor: number | null;
  status: string | null;
}

const COLORS = ["#15CAB6", "#007FFF", "#F6B53D", "#B967FF", "#FF6B6B", "#4ECDC4"];

function Dashboard() {
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,data,empreendimento,valor_venda,corretor,gerente,comissao_bruta,comissao_liq_corretor,status")
        .order("data", { ascending: false })
        .limit(2000);
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

  const m = useMemo(() => {
    const vgv = sales.reduce((s, x) => s + (x.valor_venda ?? 0), 0);
    const com = sales.reduce((s, x) => s + (x.comissao_bruta ?? 0), 0);
    const comLiq = sales.reduce((s, x) => s + (x.comissao_liq_corretor ?? 0), 0);
    const ticket = sales.length ? vgv / sales.length : 0;

    const byCorretor = group(sales, "corretor");
    const byGerente = group(sales, "gerente");
    const byEmp = group(sales, "empreendimento");
    const byMonth = groupByMonth(sales);

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

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthVgv = byMonth[monthKey]?.vgv ?? 0;
    const monthSales = byMonth[monthKey]?.count ?? 0;

    const sevenAgo = new Date(now.getTime() - 7 * 86400000);
    const weekVgv = sales
      .filter((s) => s.data && new Date(s.data) >= sevenAgo)
      .reduce((sum, x) => sum + (x.valor_venda ?? 0), 0);

    return {
      vgv,
      com,
      comLiq,
      ticket,
      topC,
      topG,
      topE,
      monthVgv,
      monthSales,
      weekVgv,
      growth,
      byCorretor,
      byGerente,
      byEmp,
      byMonth,
      months,
      sales,
    };
  }, [sales]);

  const metaVgv = cfg?.meta_vgv ?? 7_000_000;
  const metaCom = cfg?.meta_comissoes ?? 500_000;
  const realPct = Math.min(1, m.vgv / metaVgv);

  const corretorRanking = Object.entries(m.byCorretor)
    .map(([name, v]) => ({ name, vgv: v.vgv, count: v.count }))
    .sort((a, b) => b.vgv - a.vgv)
    .slice(0, 8);

  const empData = Object.entries(m.byEmp).map(([name, v]) => ({ name, value: v.vgv }));

  const monthSeries = m.months.map((k) => ({
    mes: k.slice(2),
    vgv: m.byMonth[k].vgv,
    com: m.byMonth[k].com,
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Dashboard Executivo</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
            Visão geral da <span className="text-gradient-primary">Equipe Maicon</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sales.length === 0 && !isLoading
              ? "Nenhuma venda importada ainda. Configure a integração com Google Sheets."
              : `${fmtNum(sales.length)} vendas analisadas em tempo real.`}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="VGV Total" value={m.vgv} format={fmtBRLCompact} accent="teal" icon={<DollarSign className="w-4 h-4" />} index={0} />
        <KPICard label="Vendas" value={m.sales.length} format={(n) => fmtNum(n)} accent="azure" icon={<ShoppingBag className="w-4 h-4" />} index={1} />
        <KPICard label="Ticket Médio" value={m.ticket} format={fmtBRLCompact} accent="gold" icon={<TrendingUp className="w-4 h-4" />} index={2} />
        <KPICard label="Comissão Bruta" value={m.com} format={fmtBRLCompact} accent="neutral" icon={<Award className="w-4 h-4" />} index={3} />
        <KPICard label="VGV do Mês" value={m.monthVgv} format={fmtBRLCompact} delta={m.growth} hint={`${m.monthSales} vendas`} accent="teal" icon={<TrendingUp className="w-4 h-4" />} index={4} />
        <KPICard label="VGV da Semana" value={m.weekVgv} format={fmtBRLCompact} accent="azure" icon={<TrendingUp className="w-4 h-4" />} index={5} />
        <KPICard label="Meta atingida" value={`${(realPct * 100).toFixed(1)}%`} hint={`Meta ${fmtBRLCompact(metaVgv)}`} accent="gold" icon={<Target className="w-4 h-4" />} index={6} />
        <KPICard label="Comissão Líquida" value={m.comLiq} format={fmtBRLCompact} hint={`Meta ${fmtBRLCompact(metaCom)}`} accent="neutral" icon={<Award className="w-4 h-4" />} index={7} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Melhor corretor" value={m.topC?.name ?? "—"} hint={fmtBRL(m.topC?.vgv ?? 0)} accent="teal" icon={<Trophy className="w-4 h-4" />} index={0} />
        <KPICard label="Melhor gerente" value={m.topG?.name ?? "—"} hint={fmtBRL(m.topG?.vgv ?? 0)} accent="azure" icon={<Users className="w-4 h-4" />} index={1} />
        <KPICard label="Melhor empreendimento" value={m.topE?.name ?? "—"} hint={fmtBRL(m.topE?.vgv ?? 0)} accent="gold" icon={<Building2 className="w-4 h-4" />} index={2} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Evolução de VGV" subtitle="Por mês" className="lg:col-span-2" delay={0.05}>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={monthSeries}>
                <defs>
                  <linearGradient id="vgvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15CAB6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#15CAB6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mes" stroke="rgba(255,255,255,0.5)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={fmtBRLCompact} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="vgv"
                  stroke="#15CAB6"
                  strokeWidth={2.5}
                  fill="url(#vgvFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Meta vs Realizado" subtitle={`${(realPct * 100).toFixed(1)}% da meta`} delay={0.1}>
          <div className="h-72 flex items-center justify-center">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="65%"
                outerRadius="100%"
                data={[{ name: "Meta", value: realPct * 100, fill: "url(#radGrad)" }]}
                startAngle={210}
                endAngle={-30}
              >
                <defs>
                  <linearGradient id="radGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#15CAB6" />
                    <stop offset="100%" stopColor="#007FFF" />
                  </linearGradient>
                </defs>
                <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "rgba(255,255,255,0.05)" }} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Ranking de corretores" subtitle="Top 8 por VGV" delay={0.05}>
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={corretorRanking} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={fmtBRLCompact} />
                <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.7)" fontSize={11} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vgv" radius={[0, 8, 8, 0]}>
                  {corretorRanking.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Vendas por empreendimento" delay={0.1}>
          <div className="h-80">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={empData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={3}
                >
                  {empData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

function group(sales: Sale[], key: "corretor" | "gerente" | "empreendimento") {
  const out: Record<string, { vgv: number; count: number }> = {};
  for (const s of sales) {
    const k = (s[key] ?? "—").toString();
    if (!out[k]) out[k] = { vgv: 0, count: 0 };
    out[k].vgv += s.valor_venda ?? 0;
    out[k].count += 1;
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

function top(map: Record<string, { vgv: number; count: number }>) {
  let best: { name: string; vgv: number } | null = null;
  for (const [name, v] of Object.entries(map)) {
    if (name === "—") continue;
    if (!best || v.vgv > best.vgv) best = { name, vgv: v.vgv };
  }
  return best;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-xs">
      {label && <div className="text-muted-foreground mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-medium">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
