import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Users, Building2, X, Home, Handshake } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { isHouse } from "@/lib/team";

export const Route = createFileRoute("/_authenticated/corretores")({ component: Page });

const TOOLTIP = {
  background: "rgba(15, 18, 32, 0.95)",
  border: "1px solid rgba(45, 226, 201, 0.25)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 10px 40px -10px rgba(45, 226, 201, 0.35)",
};
const COLORS = ["#2DE2C9", "#D6AF55", "#4D8DFF", "#FF5C8A", "#9A7CFF", "#6EE7B7", "#F97316", "#38BDF8"];


function Page() {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [dateFrom, setDateFrom] = useState<string>(iso(firstOfMonth));
  const [dateTo, setDateTo] = useState<string>(iso(today));
  const [corretorFilter, setCorretorFilter] = useState<string>("__all__");
  const [empFilter, setEmpFilter] = useState<string>("__all__");
  const [origin, setOrigin] = useState<"all" | "house" | "parceiro">("all");

  const { data: all = [] } = useQuery({
    queryKey: ["sales-corr-full"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("data,corretor,empreendimento,valor_venda,comissao_bruta")
        .limit(5000);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const corretoresList = useMemo(
    () => Array.from(new Set(all.map((r) => r.corretor).filter(Boolean))).sort() as string[],
    [all]
  );
  const empList = useMemo(
    () => Array.from(new Set(all.map((r) => r.empreendimento).filter(Boolean))).sort() as string[],
    [all]
  );

  const data = useMemo(() => {
    return all.filter((r) => {
      if (dateFrom && (!r.data || r.data < dateFrom)) return false;
      if (dateTo && (!r.data || r.data > dateTo)) return false;
      if (corretorFilter !== "__all__" && r.corretor !== corretorFilter) return false;
      if (empFilter !== "__all__" && r.empreendimento !== empFilter) return false;
      if (origin === "house" && !isHouse(r.corretor)) return false;
      if (origin === "parceiro" && isHouse(r.corretor)) return false;
      return true;
    });
  }, [all, dateFrom, dateTo, corretorFilter, empFilter, origin]);

  const rows = useMemo(() => {
    const map: Record<string, { vgv: number; com: number; n: number }> = {};
    for (const r of data) {
      const k = r.corretor ?? "—";
      if (!map[k]) map[k] = { vgv: 0, com: 0, n: 0 };
      map[k].vgv += r.valor_venda ?? 0;
      map[k].com += r.comissao_bruta ?? 0;
      map[k].n += 1;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.vgv - a.vgv);
  }, [data]);

  const top = rows.slice(0, 10);

  // Resumo House x Parceiros (sempre sobre 'data' já filtrado por período/origem)
  const summary = useMemo(() => {
    let house = { vgv: 0, n: 0 };
    let parc = { vgv: 0, n: 0 };
    for (const r of data) {
      const bucket = isHouse(r.corretor) ? house : parc;
      bucket.vgv += r.valor_venda ?? 0;
      bucket.n += 1;
    }
    return { house, parc };
  }, [data]);

  const hasActive =
    dateFrom !== iso(firstOfMonth) || dateTo !== iso(today) ||
    corretorFilter !== "__all__" || empFilter !== "__all__" || origin !== "all";
  const clearAll = () => {
    setDateFrom(iso(firstOfMonth));
    setDateTo(iso(today));
    setCorretorFilter("__all__");
    setEmpFilter("__all__");
    setOrigin("all");
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Ranking de corretores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.length} vendas no período · VGV {fmtBRL(data.reduce((s, r) => s + (r.valor_venda ?? 0), 0))}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="glass-card p-3 flex flex-wrap items-end gap-3"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="w-4 h-4" /><span>Período:</span>
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />

        <div className="h-5 w-px bg-border mx-1" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-4 h-4" /><span>Corretor:</span>
        </div>
        <Select value={corretorFilter} onValueChange={setCorretorFilter}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {corretoresList.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-4 h-4" /><span>Empreendimento:</span>
        </div>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {empList.map((e) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        <div className="flex items-center gap-1 rounded-full bg-secondary/40 p-1">
          {([
            ["all", "Todos", null],
            ["house", "Equipe House", <Home key="h" className="w-3 h-3" />],
            ["parceiro", "Parceiros", <Handshake key="p" className="w-3 h-3" />],
          ] as const).map(([k, lbl, ic]) => (
            <button
              key={k}
              onClick={() => setOrigin(k)}
              className={`flex items-center gap-1 h-7 px-3 rounded-full text-[11px] uppercase tracking-wider transition ${
                origin === k
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ic}
              {lbl}
            </button>
          ))}
        </div>

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="ml-auto h-8 text-xs">
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
        )}
      </motion.div>

      {/* Resumo House x Parceiros */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Home className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Equipe House</div>
            <div className="font-display text-xl font-semibold">{fmtBRL(summary.house.vgv)}</div>
            <div className="text-xs text-muted-foreground">{fmtNum(summary.house.n)} vendas</div>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Handshake className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Parceiros (imobiliárias)</div>
            <div className="font-display text-xl font-semibold">{fmtBRL(summary.parc.vgv)}</div>
            <div className="text-xs text-muted-foreground">{fmtNum(summary.parc.n)} vendas</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glass-card p-5 lg:col-span-7"
        >
          <div className="text-sm font-medium mb-3">Top 10 · VGV por corretor</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="corrBar" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#15CAB6" stopOpacity={0.55} />
                    <stop offset="50%" stopColor="#2DE2C9" />
                    <stop offset="100%" stopColor="#6EE7B7" />
                  </linearGradient>
                  <filter id="corrGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.85)" }} width={90} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(45,226,201,0.06)" }} contentStyle={TOOLTIP}
                  formatter={(v: number, _n, p) => [`${fmtBRL(v)} · ${p?.payload?.n} vendas`, "VGV"]} />
                <Bar dataKey="vgv" fill="url(#corrBar)" radius={[0, 8, 8, 0]} animationDuration={1100} style={{ filter: "url(#corrGlow)" }} />

              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="glass-card p-5 lg:col-span-5"
        >
          <div className="text-sm font-medium mb-3">Distribuição de comissões</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <radialGradient key={i} id={`pieG-${i}`} cx="50%" cy="50%" r="65%">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </radialGradient>
                  ))}
                </defs>
                <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }} />
                <Pie data={top} dataKey="com" nameKey="name" innerRadius={58} outerRadius={105} paddingAngle={3} stroke="rgba(15,18,32,0.6)" strokeWidth={2} animationDuration={1100}>
                  {top.map((_, i) => (<Cell key={i} fill={`url(#pieG-${i % COLORS.length})`} />))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="glass-card p-2"
      >
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">#</th><th className="text-left p-3">Corretor</th><th className="text-left p-3">Origem</th><th className="text-right p-3">Vendas</th><th className="text-right p-3">VGV</th><th className="text-right p-3">Comissão</th></tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const house = isHouse(v.name);
              return (
                <tr key={v.name} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{v.name}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                      house ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {house ? <Home className="w-3 h-3" /> : <Handshake className="w-3 h-3" />}
                      {house ? "House" : "Parceiro"}
                    </span>
                  </td>
                  <td className="p-3 text-right">{fmtNum(v.n)}</td>
                  <td className="p-3 text-right text-gradient-primary font-medium">{fmtBRL(v.vgv)}</td>
                  <td className="p-3 text-right">{fmtBRL(v.com)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum dado no período.</td></tr>
            )}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
