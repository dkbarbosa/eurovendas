import type { Approval } from "./types";
import { BRL, fmtPct, groupBy, statusColor } from "./utils";
import { Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export function BrokerBars({ rows }: { rows: Approval[] }) {
  const g = groupBy(rows, (r) => r.corretor || "N/I");
  const items = Array.from(g.entries())
    .map(([corretor, list]) => {
      const ap = list.filter((r) => r.situacao === "APROVADO").length;
      const cond = list.filter((r) => r.situacao === "CONDICIONADO").length;
      const rep = list.filter((r) => r.situacao === "REPROVADO").length;
      const vol = list.reduce((s, r) => s + r.valorFinanciamento, 0);
      return { corretor, total: list.length, APROVADO: ap, CONDICIONADO: cond, REPROVADO: rep, vol, taxa: (ap / list.length) * 100 };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Performance por Corretor</h3>
        <Trophy className="h-4 w-4 text-[var(--gold)]" />
      </div>

      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid stroke="oklch(1 0 0 / 6%)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="corretor" tick={{ fontSize: 10, fill: "oklch(0.85 0.02 270)" }} width={80} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 4%)" }}
              contentStyle={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number, n, p) => [`${v} · ${BRL(p?.payload?.vol ?? 0)} · taxa ${fmtPct(p?.payload?.taxa ?? 0, 0)}`, n]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="APROVADO" stackId="a" fill={statusColor("APROVADO")} animationDuration={800} radius={[0, 0, 0, 0]} />
            <Bar dataKey="CONDICIONADO" stackId="a" fill={statusColor("CONDICIONADO")} animationDuration={800} />
            <Bar dataKey="REPROVADO" stackId="a" fill={statusColor("REPROVADO")} animationDuration={800} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
