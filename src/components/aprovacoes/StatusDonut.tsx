import type { Approval } from "./types";
import { statusColor, fmtPct } from "./utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export function StatusDonut({ rows }: { rows: Approval[] }) {
  const groups = ["APROVADO", "CONDICIONADO", "REPROVADO"] as const;
  const data = groups.map((g) => ({
    name: g,
    value: rows.filter((r) => r.situacao === g).length,
    color: statusColor(g),
  }));
  const total = data.reduce((s, c) => s + c.value, 0);
  const aprov = data[0].value;

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Status das Aprovações</h3>
        <span className="text-xs text-muted-foreground">{total} processos</span>
      </div>

      <div className="relative mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={{
                background: "oklch(0.16 0.02 270)",
                border: "1px solid oklch(1 0 0 / 10%)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: number, n) => [`${v} (${fmtPct((v / total) * 100, 1)})`, n]}
            />
            <Pie
              data={data}
              dataKey="value"
              innerRadius={62}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
              animationDuration={900}
              animationBegin={150}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold">{fmtPct((aprov / total) * 100, 0)}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aprovação</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.map((c) => (
          <div key={c.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              <span className="capitalize">{c.name.toLowerCase()}</span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="font-semibold">{c.value}</span>
              <span className="text-xs text-muted-foreground w-12 text-right">{fmtPct((c.value / total) * 100)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
