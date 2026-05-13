import type { Approval } from "./types";

export const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const pct = (n: number, total: number) => (total ? (n / total) * 100 : 0);
export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

export function groupBy<T>(arr: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}

export function statusColor(s: string) {
  if (s === "APROVADO") return "var(--success)";
  if (s === "CONDICIONADO") return "var(--warning)";
  if (s === "REPROVADO") return "var(--destructive)";
  return "var(--muted-foreground)";
}

export function parseBR(d: string): Date | null {
  if (!d) return null;
  const [dd, mm, yyyy] = d.split("/");
  if (!dd || !mm || !yyyy) return null;
  return new Date(+yyyy, +mm - 1, +dd);
}

export function approvalRate(rows: Approval[]) {
  const ap = rows.filter((r) => r.situacao === "APROVADO").length;
  return pct(ap, rows.length);
}
