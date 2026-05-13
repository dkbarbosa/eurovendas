import type { Approval } from "./types";
import { BRL, fmtPct, groupBy, statusColor } from "./utils";
import { Trophy } from "lucide-react";

export function BrokerBars({ rows }: { rows: Approval[] }) {
  const g = groupBy(rows, (r) => r.corretor || "NÃO INFORMADO");
  const items = Array.from(g.entries())
    .map(([corretor, list]) => {
      const ap = list.filter((r) => r.situacao === "APROVADO").length;
      const cond = list.filter((r) => r.situacao === "CONDICIONADO").length;
      const rep = list.filter((r) => r.situacao === "REPROVADO").length;
      const vol = list.reduce((s, r) => s + r.valorFinanciamento, 0);
      return { corretor, total: list.length, ap, cond, rep, vol, taxa: (ap / list.length) * 100 };
    })
    .sort((a, b) => b.total - a.total);

  const max = Math.max(...items.map((i) => i.total));

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Performance por Corretor</h3>
        <Trophy className="h-4 w-4 text-[var(--gold)]" />
      </div>

      <div className="mt-4 space-y-3 max-h-[340px] overflow-auto pr-1">
        {items.map((it, idx) => (
          <div key={it.corretor} className="rounded-xl border border-border/40 bg-card/40 p-3 hover:bg-card/70 transition">
            <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {idx === 0 && <Trophy className="h-3.5 w-3.5 text-[var(--gold)]" />}
                <span className="font-semibold uppercase tracking-wide">{it.corretor}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                <span>{it.total} cli</span>
                <span className="text-foreground font-semibold">{BRL(it.vol)}</span>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-success font-semibold">{fmtPct(it.taxa, 0)}</span>
              </div>
            </div>

            <div
              className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted/40"
              style={{ width: `${(it.total / max) * 100}%`, minWidth: "20%" }}
            >
              {[
                { v: it.ap, c: statusColor("APROVADO") },
                { v: it.cond, c: statusColor("CONDICIONADO") },
                { v: it.rep, c: statusColor("REPROVADO") },
              ].map((seg, i) =>
                seg.v ? (
                  <div
                    key={i}
                    className="animate-bar-x h-full"
                    style={{
                      flex: seg.v,
                      background: seg.c,
                      animationDelay: `${idx * 80 + i * 100}ms`,
                    }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
