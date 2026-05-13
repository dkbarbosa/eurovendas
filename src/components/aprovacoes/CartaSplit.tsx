import type { Approval } from "./types";
import { BRL, fmtPct, groupBy } from "./utils";
import { CreditCard } from "lucide-react";

export function CartaSplit({ rows }: { rows: Approval[] }) {
  const g = groupBy(rows, (r) => r.cartaFinanciamento || "N/A");
  const items = Array.from(g.entries())
    .map(([k, list]) => ({
      k,
      n: list.length,
      vol: list.reduce((s, r) => s + r.valorFinanciamento, 0),
    }))
    .sort((a, b) => b.vol - a.vol);

  const total = items.reduce((s, i) => s + i.vol, 0);
  const palette: Record<string, string> = {
    MCMV: "var(--gradient-success)",
    SBPE: "var(--gradient-primary)",
    "N/A": "var(--gradient-warn)",
  };

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Modalidade</h3>
        <CreditCard className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-5 space-y-4">
        {items.map((it, i) => (
          <div key={it.k} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold tracking-wide">{it.k}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{it.n} · {fmtPct((it.vol / total) * 100, 0)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full animate-bar-x rounded-full"
                style={{
                  width: `${(it.vol / total) * 100}%`,
                  background: palette[it.k] || "var(--gradient-primary)",
                  animationDelay: `${i * 120}ms`,
                }}
              />
            </div>
            <div className="text-xs text-foreground tabular-nums">{BRL(it.vol)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
