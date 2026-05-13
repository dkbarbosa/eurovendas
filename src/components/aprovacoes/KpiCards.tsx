import type { Approval } from "./types";
import { BRL, approvalRate, fmtPct } from "./utils";
import { CheckCircle2, AlertTriangle, XCircle, Wallet, Users, Percent } from "lucide-react";

export function KpiCards({ rows }: { rows: Approval[] }) {
  const total = rows.length;
  const aprov = rows.filter((r) => r.situacao === "APROVADO").length;
  const cond = rows.filter((r) => r.situacao === "CONDICIONADO").length;
  const repr = rows.filter((r) => r.situacao === "REPROVADO").length;
  const totalFin = rows.reduce((s, r) => s + r.valorFinanciamento, 0);
  const ticket = totalFin / Math.max(1, rows.length);
  const rate = approvalRate(rows);

  const cards = [
    { label: "Taxa de Aprovação", value: fmtPct(rate), icon: Percent, gradient: "bg-gradient-primary", sub: `${aprov} de ${total}` },
    { label: "Aprovados", value: aprov.toString(), icon: CheckCircle2, gradient: "bg-gradient-success", sub: fmtPct((aprov / total) * 100) + " do total" },
    { label: "Condicionados", value: cond.toString(), icon: AlertTriangle, gradient: "bg-gradient-warn", sub: fmtPct((cond / total) * 100) + " do total" },
    { label: "Reprovados", value: repr.toString(), icon: XCircle, gradient: "bg-gradient-danger", sub: fmtPct((repr / total) * 100) + " do total" },
    { label: "Volume Financiado", value: BRL(totalFin), icon: Wallet, gradient: "bg-gradient-primary", sub: `${rows.length} contratos` },
    { label: "Ticket Médio", value: BRL(ticket), icon: Users, gradient: "bg-gradient-success", sub: "por cliente" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="approvals-glass relative overflow-hidden rounded-2xl p-4 animate-rise"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl ${c.gradient}`} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.gradient} text-primary-foreground shadow`}>
              <c.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight">{c.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
