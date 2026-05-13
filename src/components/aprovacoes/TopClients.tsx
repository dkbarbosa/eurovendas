import type { Approval } from "./types";
import { BRL } from "./utils";
import { Crown } from "lucide-react";

export function TopClients({ rows }: { rows: Approval[] }) {
  const top = [...rows].sort((a, b) => b.valorFinanciamento - a.valorFinanciamento).slice(0, 6);
  const max = Math.max(...top.map((t) => t.valorFinanciamento));

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Clientes (Volume)</h3>
        <Crown className="h-4 w-4 text-[var(--gold)]" />
      </div>

      <ol className="mt-4 space-y-3">
        {top.map((c, i) => (
          <li key={c.cpf + i} className="rounded-xl border border-border/40 bg-card/40 p-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={{
                  background: i === 0 ? "var(--gradient-warn)" : "var(--gradient-primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.cliente}</div>
                <div className="text-[11px] text-muted-foreground truncate">{c.empreendimento} · {c.corretor}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums">{BRL(c.valorFinanciamento)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.cartaFinanciamento}</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full animate-bar-x rounded-full bg-gradient-primary"
                style={{ width: `${(c.valorFinanciamento / max) * 100}%`, animationDelay: `${i * 80}ms` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
