import type { Approval } from "./types";
import { BRL, parseBR } from "./utils";
import { useMemo } from "react";

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
    return Array.from(byDay.values()).sort((a, b) => +a.date - +b.date);
  }, [rows]);

  const W = 560, H = 240, P = 36;
  const maxVol = Math.max(...data.map((d) => d.vol), 1);
  const xs = (i: number) => P + (i * (W - P * 2)) / Math.max(1, data.length - 1);
  const ys = (v: number) => H - P - (v / maxVol) * (H - P * 2);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(d.vol)}`).join(" ");
  const area = `${path} L ${xs(data.length - 1)} ${H - P} L ${xs(0)} ${H - P} Z`;

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Linha do Tempo · Entradas</h3>
        <span className="text-xs text-muted-foreground">{data.length} dias</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full">
        <defs>
          <linearGradient id="approvAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.16 185)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="oklch(0.82 0.16 185)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="approvLineGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.16 185)" />
            <stop offset="100%" stopColor="oklch(0.78 0.12 82)" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={P} x2={W - P} y1={P + (i * (H - P * 2)) / 3} y2={P + (i * (H - P * 2)) / 3}
                stroke="oklch(1 0 0 / 5%)" />
        ))}

        <path d={area} fill="url(#approvAreaGrad)" />
        <path d={path} fill="none" stroke="url(#approvLineGrad)" strokeWidth="2.5" strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 6px oklch(0.82 0.16 185 / 60%))" }} />

        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xs(i)} cy={ys(d.vol)} r="4" fill="oklch(0.82 0.16 185)"
                    stroke="oklch(0.16 0.02 270)" strokeWidth="2" />
            <title>{d.date.toLocaleDateString("pt-BR")} — {BRL(d.vol)} ({d.n})</title>
          </g>
        ))}

        {[0, Math.floor(data.length / 2), data.length - 1].map((i) =>
          data[i] ? (
            <text key={i} x={xs(i)} y={H - 10} textAnchor="middle"
                  fontSize="10" fill="oklch(0.72 0.02 270)">
              {data[i].date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
