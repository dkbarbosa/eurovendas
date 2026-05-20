import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgendamentos } from "@/hooks/use-agendamentos";
import { parseAgendamento } from "@/lib/agendamentos-parse";
import { isHouse } from "@/lib/team";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { fmtNum } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, Clock, TrendingUp, Filter, Loader2, AlertCircle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agendamentos")({ component: AgendamentosPage });

type TeamFilter = "all" | "house" | "imob" | "desconhecido";
type Period = "7d" | "30d" | "90d" | "mes_atual" | "mes_anterior" | "futuro" | "all";

const COLORS = ["#2DE2C9", "#D6AF55", "#4D8DFF", "#FF5C8A", "#9A7CFF", "#6EE7B7", "#F97316", "#38BDF8"];
const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function periodRange(p: Period): [Date | null, Date | null] {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "7d") return [new Date(now.getTime() - 7 * 864e5), null];
  if (p === "30d") return [new Date(now.getTime() - 30 * 864e5), null];
  if (p === "90d") return [new Date(now.getTime() - 90 * 864e5), null];
  if (p === "mes_atual") return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  if (p === "mes_anterior")
    return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  if (p === "futuro") return [now, null];
  return [null, null];
}

function AgendamentosPage() {
  const { data: events = [], isLoading, error, refetch, isFetching } = useAgendamentos();

  // corretores conhecidos para melhorar o parsing
  const { data: knownBrokers = [] } = useQuery({
    queryKey: ["known-brokers"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("corretor").not("corretor", "is", null).limit(5000);
      const set = new Set<string>();
      for (const r of data ?? []) if (r.corretor) set.add(r.corretor as string);
      return Array.from(set);
    },
    staleTime: 5 * 60_000,
  });

  const [period, setPeriod] = useState<Period>("mes_atual");
  const [team, setTeam] = useState<TeamFilter>("all");
  const [broker, setBroker] = useState<string>("all");

  const parsed = useMemo(() => {
    return events
      .filter((e) => e.status !== "cancelled")
      .map((e) => {
        const p = parseAgendamento(e.summary, e.description, e.creatorEmail, knownBrokers);
        return {
          ...e,
          startDate: e.start ? new Date(e.start) : null,
          broker: p.broker,
          origin: p.origin,
          cliente: p.cliente,
        };
      })
      .filter((e) => e.startDate);
  }, [events, knownBrokers]);

  const filtered = useMemo(() => {
    const [from, to] = periodRange(period);
    return parsed.filter((e) => {
      const d = e.startDate!;
      if (from && d < from) return false;
      if (to && d >= to) return false;
      if (team === "house" && e.origin !== "house") return false;
      if (team === "imob" && e.origin !== "parceiro") return false;
      if (team === "desconhecido" && e.origin !== "desconhecido") return false;
      if (broker !== "all" && e.broker !== broker) return false;
      return true;
    });
  }, [parsed, period, team, broker]);

  const corretoresList = useMemo(() => {
    const set = new Set<string>();
    for (const e of parsed) {
      if (!e.broker) continue;
      if (team === "house" && e.origin !== "house") continue;
      if (team === "imob" && e.origin !== "parceiro") continue;
      set.add(e.broker);
    }
    return Array.from(set).sort();
  }, [parsed, team]);

  // ===== KPIs =====
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 864e5);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 864e5);

  const totals = useMemo(() => {
    const hoje = filtered.filter((e) => e.startDate! >= startOfDay && e.startDate! < endOfDay).length;
    const semana = filtered.filter((e) => e.startDate! >= startOfWeek && e.startDate! < endOfWeek).length;
    const futuros = filtered.filter((e) => e.startDate! >= now).length;
    const house = filtered.filter((e) => e.origin === "house").length;
    const imob = filtered.filter((e) => e.origin === "parceiro").length;
    return { total: filtered.length, hoje, semana, futuros, house, imob };
  }, [filtered, now, startOfDay, endOfDay, startOfWeek, endOfWeek]);

  // ===== Charts =====
  const porCorretor = useMemo(() => {
    const m = new Map<string, { name: string; total: number; origin: string }>();
    for (const e of filtered) {
      const key = e.broker ?? "Não identificado";
      const cur = m.get(key) ?? { name: key, total: 0, origin: e.origin };
      cur.total += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [filtered]);

  const porDiaSemana = useMemo(() => {
    const arr = DIAS_PT.map((d) => ({ dia: d, total: 0 }));
    for (const e of filtered) arr[e.startDate!.getDay()].total += 1;
    return arr;
  }, [filtered]);

  const porHora = useMemo(() => {
    const arr = Array.from({ length: 13 }, (_, i) => ({ hora: `${i + 7}h`, total: 0 }));
    for (const e of filtered) {
      const h = e.startDate!.getHours();
      const idx = Math.min(Math.max(h - 7, 0), 12);
      arr[idx].total += 1;
    }
    return arr;
  }, [filtered]);

  const timeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const d = e.startDate!;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, total]) => {
        const [y, m, day] = k.split("-").map(Number);
        return { label: `${day}/${MESES_PT[m - 1]}`, total, key: k, ts: new Date(y, m - 1, day).getTime() };
      });
  }, [filtered]);

  const origemPie = useMemo(
    () => [
      { name: "House", value: filtered.filter((e) => e.origin === "house").length },
      { name: "Parceiros", value: filtered.filter((e) => e.origin === "parceiro").length },
      { name: "Não ident.", value: filtered.filter((e) => e.origin === "desconhecido").length },
    ].filter((x) => x.value > 0),
    [filtered],
  );

  const upcoming = useMemo(
    () => filtered.filter((e) => e.startDate! >= now).sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime()).slice(0, 12),
    [filtered, now],
  );

  function clearAll() {
    setPeriod("mes_atual");
    setTeam("all");
    setBroker("all");
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visitas, reuniões e fechamentos sincronizados em tempo real do Google Calendar
            <span className="ml-2 text-xs opacity-70">· {fmtNum(events.length)} eventos · atualização a cada 90s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            Atualizar
          </Button>
        </div>
      </motion.div>

      {error && (
        <div className="glass-card p-4 flex items-center gap-3 border border-destructive/30">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <div className="text-sm">{(error as Error).message}</div>
        </div>
      )}

      {/* Filtros */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" /> Filtros
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="mes_atual">Mês atual</SelectItem>
            <SelectItem value="mes_anterior">Mês anterior</SelectItem>
            <SelectItem value="futuro">Próximos</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
          {(["all", "house", "imob", "desconhecido"] as TeamFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTeam(t); setBroker("all"); }}
              className={`px-3 h-7 text-xs rounded-md transition ${team === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "all" ? "Todos" : t === "house" ? "House" : t === "imob" ? "Imob" : "Sem ident."}
            </button>
          ))}
        </div>

        <Select value={broker} onValueChange={setBroker}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Corretor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os corretores</SelectItem>
            {corretoresList.map((c) => (
              <SelectItem key={c} value={c}>
                {c} {isHouse(c) ? "· House" : "· Imob"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={<CalendarDays className="w-5 h-5" />} label="Total no período" value={fmtNum(totals.total)} index={0} />
        <KPICard icon={<Clock className="w-5 h-5" />} label="Hoje" value={fmtNum(totals.hoje)} index={1} accent="azure" />
        <KPICard icon={<CalendarDays className="w-5 h-5" />} label="Esta semana" value={fmtNum(totals.semana)} index={2} accent="gold" />
        <KPICard icon={<TrendingUp className="w-5 h-5" />} label="Futuros" value={fmtNum(totals.futuros)} index={3} />
        <KPICard icon={<Users className="w-5 h-5" />} label="House" value={fmtNum(totals.house)} index={4} accent="azure" />
        <KPICard icon={<Users className="w-5 h-5" />} label="Parceiros" value={fmtNum(totals.imob)} index={5} accent="gold" />
      </div>

      {isLoading ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            <ChartCard title="Timeline" subtitle="Visitas por dia" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="total" stroke="#2DE2C9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Origem" subtitle="House vs Parceiros">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={origemPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {origemPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="Top corretores" subtitle="Volume de visitas no período">
              <ResponsiveContainer width="100%" height={Math.max(260, porCorretor.length * 28)}>
                <BarChart data={porCorretor} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {porCorretor.map((d, i) => (
                      <Cell key={i} fill={d.origin === "house" ? "#2DE2C9" : d.origin === "parceiro" ? "#D6AF55" : "#9A7CFF"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-4">
              <ChartCard title="Dia da semana" subtitle="Quando os clientes mais visitam">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={porDiaSemana}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="total" fill="#4D8DFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Faixa horária" subtitle="Concentração ao longo do dia">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={porHora}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="total" fill="#D6AF55" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          <ChartCard title="Próximos agendamentos" subtitle={`${upcoming.length} eventos futuros no filtro atual`}>
            {upcoming.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Nenhum agendamento futuro.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {upcoming.map((e) => (
                  <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{e.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.startDate!.toLocaleString("pt-BR", { day: "2-digit", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        {e.broker ? ` · ${e.broker}` : " · sem corretor"}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${e.origin === "house" ? "bg-[#2DE2C9]/15 text-[#2DE2C9]" : e.origin === "parceiro" ? "bg-[#D6AF55]/15 text-[#D6AF55]" : "bg-muted text-muted-foreground"}`}>
                          {e.origin === "house" ? "House" : e.origin === "parceiro" ? "Imob" : "—"}
                        </span>
                      </div>
                    </div>
                    {e.htmlLink && (
                      <a href={e.htmlLink} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        Abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
