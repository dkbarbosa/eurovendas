import type { Approval } from "./types";
import { BRL, groupBy } from "./utils";
import { Building2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export function EmpreendimentoBars({ rows }: { rows: Approval[] }) {
  const g = groupBy(rows, (r) => r.empreendimento || "—");
  const items = Array.from(g.entries())
    .map(([nome, list]) => ({
      nome,
      total: list.length,
      vol: Math.round(list.reduce((s, r) => s + r.valorFinanciamento, 0)),
      ap: list.filter((r) => r.situacao === "APROVADO").length,
    }))
    .sort((a, b) => b.vol - a.vol);

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Volume por Empreendimento</h3>
        <Building2 className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
            <defs>
              <linearGradient id="empBar" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.82 0.16 185)" />
                <stop offset="100%" stopColor="oklch(0.55 0.13 200)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(1 0 0 / 6%)" vertical={false} />
            <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} interval={0} angle={-15} textAnchor="end" height={50} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 4%)" }}
              contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number) => [BRL(v), "Volume"]}
              labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.total ?? 0} processos`}
            />
            <Bar dataKey="vol" radius={[8, 8, 0, 0]} animationDuration={900}>
              {items.map((_, i) => (
                <Cell key={i} fill="url(#empBar)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
