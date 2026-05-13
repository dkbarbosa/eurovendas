import type { Approval } from "./types";
import { statusColor, fmtPct } from "./utils";

export function StatusDonut({ rows }: { rows: Approval[] }) {
  const groups = ["APROVADO", "CONDICIONADO", "REPROVADO"] as const;
  const counts = groups.map((g) => ({ g, n: rows.filter((r) => r.situacao === g).length }));
  const total = counts.reduce((s, c) => s + c.n, 0);

  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Status das Aprovações</h3>
        <span className="text-xs text-muted-foreground">{total} processos</span>
      </div>

      <div className="mt-4 flex items-center justify-center">
        <div className="relative">
          <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="oklch(1 0 0 / 6%)" strokeWidth="22" />
            {counts.map((c, i) => {
              const len = (c.n / total) * C;
              const dasharray = `${len} ${C - len}`;
              const el = (
                <circle
                  key={c.g}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={statusColor(c.g)}
                  strokeWidth="22"
                  strokeDasharray={dasharray}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  style={{
                    transition: "stroke-dasharray 1s ease",
                    filter: `drop-shadow(0 0 8px ${statusColor(c.g)})`,
                    animation: `approvals-rise 0.8s ease ${i * 0.15}s both`,
                  }}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold">{fmtPct((counts[0].n / total) * 100, 0)}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aprovação</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {counts.map((c) => (
          <div key={c.g} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(c.g) }} />
              <span className="capitalize">{c.g.toLowerCase()}</span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="font-semibold">{c.n}</span>
              <span className="text-xs text-muted-foreground w-12 text-right">{fmtPct((c.n / total) * 100)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
