import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtDate } from "@/lib/format";
import { Download, Search, Users } from "lucide-react";
import { isHouse } from "@/lib/team";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/vendas")({ component: Vendas });

const TOOLTIP = {
  background: "oklch(0.16 0.02 270)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: 12,
  fontSize: 12,
};
const PIE_COLORS = ["oklch(0.82 0.16 185)", "oklch(0.78 0.12 82)", "oklch(0.7 0.18 30)", "oklch(0.6 0.18 300)", "oklch(0.65 0.18 140)"];

function Vendas() {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<"all" | "house" | "imob">("all");
  const [corretorFilter, setCorretorFilter] = useState<string>("__all__");
  const [dateFrom, setDateFrom] = useState<string>(iso(firstOfMonth));
  const [dateTo, setDateTo] = useState<string>(iso(today));
  const [valMin, setValMin] = useState<string>("");
  const [valMax, setValMax] = useState<string>("");
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-all"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*").order("data", { ascending: false }).limit(5000);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const allStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of sales) if (r.status) set.add(r.status);
    return Array.from(set).sort();
  }, [sales]);

  const corretoresList = useMemo(() => {
    const set = new Set<string>();
    for (const r of sales) {
      const c = r.corretor;
      if (!c) continue;
      if (teamFilter === "house" && !isHouse(c)) continue;
      if (teamFilter === "imob" && isHouse(c)) continue;
      set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales, teamFilter]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    const min = valMin ? Number(valMin) : null;
    const max = valMax ? Number(valMax) : null;
    return sales.filter((r) => {
      if (statusFilter.length && !statusFilter.includes(r.status ?? "—")) return false;
      if (dateFrom && (!r.data || r.data < dateFrom)) return false;
      if (dateTo && (!r.data || r.data > dateTo)) return false;
      if (min != null && (r.valor_venda ?? 0) < min) return false;
      if (max != null && (r.valor_venda ?? 0) > max) return false;
      if (teamFilter !== "all") {
        const house = isHouse(r.corretor);
        if (teamFilter === "house" && !house) return false;
        if (teamFilter === "imob" && house) return false;
      }
      if (corretorFilter !== "__all__" && r.corretor !== corretorFilter) return false;
      if (!s) return true;
      return [r.empreendimento, r.unidade, r.comprador, r.corretor, r.gerente, r.status]
        .filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [sales, q, statusFilter, dateFrom, dateTo, valMin, valMax, teamFilter, corretorFilter]);

  const hasActiveFilters = statusFilter.length > 0 || dateFrom || dateTo || valMin || valMax || q || teamFilter !== "all" || corretorFilter !== "__all__";
  const clearAll = () => { setStatusFilter([]); setDateFrom(iso(firstOfMonth)); setDateTo(iso(today)); setValMin(""); setValMax(""); setQ(""); setTeamFilter("all"); setCorretorFilter("__all__"); };


  const byEmp = useMemo(() => {
    const m = new Map<string, { vgv: number; n: number }>();
    for (const r of filtered) {
      const k = r.empreendimento ?? "—";
      const cur = m.get(k) ?? { vgv: 0, n: 0 };
      cur.vgv += r.valor_venda ?? 0;
      cur.n += 1;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([nome, v]) => ({ nome, vgv: Math.round(v.vgv), n: v.n }))
      .sort((a, b) => b.vgv - a.vgv)
      .slice(0, 8);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (!r.data) continue;
      const d = new Date(r.data);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(k, (m.get(k) ?? 0) + (r.valor_venda ?? 0));
    }
    return Array.from(m.entries())
      .sort()
      .map(([k, v]) => {
        const [y, mo] = k.split("-");
        return { label: `${mo}/${y.slice(2)}`, vgv: Math.round(v) };
      });
  }, [filtered]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = r.status ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `vendas-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Vendas</h1>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 w-64" />
          </div>
          <Button onClick={exportXlsx} variant="secondary"><Download className="w-4 h-4 mr-2" />Excel</Button>
        </div>
      </div>

      {allStatuses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-xs uppercase tracking-widest text-muted-foreground mr-1">Status</span>
          <button
            onClick={() => setStatusFilter([])}
            className={`px-3 py-1 rounded-full text-xs border transition ${
              statusFilter.length === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/40 border-border hover:bg-secondary"
            }`}
          >
            Todos <span className="opacity-70 ml-1">{sales.length}</span>
          </button>
          {allStatuses.map((st) => {
            const active = statusFilter.includes(st);
            const count = sales.filter((r) => (r.status ?? "—") === st).length;
            return (
              <button
                key={st}
                onClick={() =>
                  setStatusFilter((prev) =>
                    prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
                  )
                }
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/40 border-border hover:bg-secondary"
                }`}
              >
                {st} <span className="opacity-70 ml-1">{count}</span>
              </button>
            );
          })}
          {statusFilter.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
            </span>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="glass-card p-3 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">De</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Até</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor mínimo</label>
          <Input type="number" inputMode="numeric" value={valMin} onChange={(e) => setValMin(e.target.value)} placeholder="R$ 0" className="h-9 w-36" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor máximo</label>
          <Input type="number" inputMode="numeric" value={valMax} onChange={(e) => setValMax(e.target.value)} placeholder="R$ ∞" className="h-9 w-36" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {filtered.length} de {sales.length} · VGV {fmtBRL(filtered.reduce((s, r) => s + (r.valor_venda ?? 0), 0))}
          </span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs">Limpar</Button>
          )}
        </div>
      </motion.div>


      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glass-card p-5 lg:col-span-7"
        >
          <div className="text-sm font-medium mb-3">VGV por empreendimento</div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEmp} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                <defs>
                  <linearGradient id="vendBar" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.16 185)" />
                    <stop offset="100%" stopColor="oklch(0.55 0.13 200)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 6%)" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} interval={0} angle={-15} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip cursor={{ fill: "oklch(1 0 0 / 4%)" }} contentStyle={TOOLTIP} formatter={(v: number) => [fmtBRL(v), "VGV"]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.n ?? 0} vendas`} />
                <Bar dataKey="vgv" fill="url(#vendBar)" radius={[8, 8, 0, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="glass-card p-5 lg:col-span-5"
        >
          <div className="text-sm font-medium mb-3">Vendas por status</div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none" animationDuration={900}>
                  {byStatus.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="glass-card p-5 lg:col-span-12"
        >
          <div className="text-sm font-medium mb-3">Evolução mensal de VGV</div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byMonth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vendArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.16 185)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.82 0.16 185)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 6%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => [fmtBRL(v), "VGV"]} />
                <Area type="monotone" dataKey="vgv" stroke="oklch(0.82 0.16 185)" strokeWidth={2.5} fill="url(#vendArea)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
        className="glass-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Empreendimento</th>
                <th className="text-left p-3">Unidade</th>
                <th className="text-left p-3">Comprador</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-left p-3">Corretor</th>
                <th className="text-left p-3">Gerente</th>
                <th className="text-right p-3">Comissão</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3">{fmtDate(r.data)}</td>
                  <td className="p-3 font-medium">{r.empreendimento}</td>
                  <td className="p-3 text-muted-foreground">{r.unidade}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-[200px]">{r.comprador}</td>
                  <td className="p-3 text-right">{fmtBRL(r.valor_venda)}</td>
                  <td className="p-3">{r.corretor}</td>
                  <td className="p-3 text-muted-foreground">{r.gerente}</td>
                  <td className="p-3 text-right text-success">{fmtBRL(r.comissao_bruta)}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-secondary text-xs">{r.status ?? "—"}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma venda encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
