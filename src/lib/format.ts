export const fmtBRL = (n: number | null | undefined) => {
  if (n == null || isNaN(n as number)) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
};

export const fmtBRLCompact = (n: number | null | undefined) => {
  if (n == null || isNaN(n as number)) return "R$ 0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `R$ ${(n / 1e3).toFixed(1)}K`;
  return fmtBRL(n);
};

export const fmtNum = (n: number | null | undefined) =>
  n == null ? "0" : new Intl.NumberFormat("pt-BR").format(n);

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null ? "0%" : `${(n * 100).toFixed(digits)}%`;

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR").format(date);
};
