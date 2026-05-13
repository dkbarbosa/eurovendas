import { useMemo, useState } from "react";
import type { Approval } from "./types";
import { BRL, statusColor } from "./utils";
import { Search } from "lucide-react";

export function ClientsTable({ rows }: { rows: Approval[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"TODOS" | "APROVADO" | "CONDICIONADO" | "REPROVADO">("TODOS");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "TODOS" && r.situacao !== filter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        r.cliente.toLowerCase().includes(s) ||
        r.corretor.toLowerCase().includes(s) ||
        r.empreendimento.toLowerCase().includes(s) ||
        r.cpf.includes(s)
      );
    });
  }, [rows, q, filter]);

  const tabs = ["TODOS", "APROVADO", "CONDICIONADO", "REPROVADO"] as const;

  return (
    <div className="approvals-glass rounded-2xl p-6 animate-rise h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Detalhamento de Clientes</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, corretor..."
              className="h-8 w-56 rounded-md border border-border bg-input/40 pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
              filter === t
                ? "bg-primary text-primary-foreground"
                : "bg-card/50 text-muted-foreground hover:bg-card"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-border/40">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-card/95 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Empreendimento</th>
              <th className="px-3 py-2.5">Corretor</th>
              <th className="px-3 py-2.5 text-right">Renda</th>
              <th className="px-3 py-2.5 text-right">Financiamento</th>
              <th className="px-3 py-2.5 text-center">Carta</th>
              <th className="px-3 py-2.5 text-right">Prazo</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.cpf + i} className="border-t border-border/30 hover:bg-card/60 transition">
                <td className="px-3 py-2.5">
                  <div className="font-semibold">{r.cliente}</div>
                  <div className="text-[10px] text-muted-foreground">{r.cpf}</div>
                </td>
                <td className="px-3 py-2.5">{r.empreendimento}</td>
                <td className="px-3 py-2.5 uppercase">{r.corretor}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{BRL(r.renda)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{BRL(r.valorFinanciamento)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{r.cartaFinanciamento}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.prazoMeses || "—"}</td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: `color-mix(in oklab, ${statusColor(r.situacao)} 18%, transparent)`,
                      color: statusColor(r.situacao),
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(r.situacao) }} />
                    {r.situacao}
                  </span>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum resultado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">{filtered.length} de {rows.length} registros</div>
    </div>
  );
}
