import type { Approval } from "./types";
import { BRL, parseBR } from "./utils";
import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function TimelineChart({ rows }: { rows: Approval[] }) {
  const data = useMemo(() => {
    const byDay = new Map<string, { date: Date; vol: number; n: number }>();
    for (const r of rows) {
      const d = parseBR(r.dataEntrada);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      const cur = byDay.get(key) || { date: d, vol: 0, n: 0 };
      cur.vol += r.valorFinanciamento;
      cur.n += 1;
      byDay.set(key, cur);
    }
    return Array.from(byDay.values())
      .sort((a, b) => +a.date - +b.date)
      .map((d) => ({
        label: d.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        vol: Math.round(d.vol),
        n: d.n,
      }));
  }, [rows]);

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Linha do Tempo · Entradas</h3>
        <span className="text-xs text-muted-foreground">{data.length} dias</span>
      </div>

      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="approvArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.82 0.16 185)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.82 0.16 185)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(1 0 0 / 6%)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number, n) => (n === "vol" ? [BRL(v), "Volume"] : [v, "Processos"])}
            />
            <Area type="monotone" dataKey="vol" stroke="oklch(0.82 0.16 185)" strokeWidth={2.5} fill="url(#approvArea)" animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
