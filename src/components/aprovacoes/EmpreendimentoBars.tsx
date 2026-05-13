import type { Approval } from "./types";
import { BRL, groupBy } from "./utils";
import { Building2 } from "lucide-react";

export function EmpreendimentoBars({ rows }: { rows: Approval[] }) {
  const g = groupBy(rows, (r) => r.empreendimento || "—");
  const items = Array.from(g.entries())
    .map(([nome, list]) => ({
      nome,
      total: list.length,
      vol: list.reduce((s, r) => s + r.valorFinanciamento, 0),
      ap: list.filter((r) => r.situacao === "APROVADO").length,
    }))
    .sort((a, b) => b.vol - a.vol);

  const maxVol = Math.max(...items.map((i) => i.vol));

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Volume por Empreendimento</h3>
        <Building2 className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-6 flex h-[260px] items-end justify-around gap-3">
        {items.map((it, i) => {
          const h = (it.vol / maxVol) * 220;
          return (
            <div key={it.nome} className="group relative flex flex-1 flex-col items-center gap-2">
              <div className="text-xs font-semibold text-foreground tabular-nums opacity-70 group-hover:opacity-100 transition">
                {BRL(it.vol)}
              </div>
              <div
                className="w-full max-w-[64px] rounded-t-lg animate-bar-y relative overflow-hidden"
                style={{
                  height: `${h}px`,
                  background: "var(--gradient-primary)",
                  boxShadow: "0 -4px 30px -8px oklch(0.78 0.14 185 / 50%)",
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
              <div className="mt-1 w-full text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide truncate">{it.nome}</div>
                <div className="text-[10px] text-muted-foreground">{it.total} · {it.ap} aprov.</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
