// Helpers for parsing Google Sheets rows of the "Equipe Maicon" tab.
// Pure utility module (no client-only imports).

export const SHEET_HEADERS = [
  "Data",
  "Empreendimento",
  "Unidade",
  "Comprador",
  "Valor da Venda",
  "Corretor",
  "Coaphar",
  "Gerente",
  "% Corr.",
  "Com. Bruta",
  "Adiant. Corr.",
  "Bônus Corr.",
  "Com. Líq. Corr.",
  "% Ger.",
  "Com. Ger. Bruta",
  "Adiant. Ger.",
  "Bônus Ger.",
  "Com. Líq. Ger.",
  "Status",
  "Mês/Ano",
  "Observações",
] as const;

function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return raw;
  const s = String(raw)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parsePct(raw: unknown): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  // Sheets often returns 0.016, but humans type "1,6%" → 1.6
  return n > 1 ? n / 100 : n;
}

function parseText(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

function parseDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // ISO
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export interface SaleRow {
  data: string | null;
  empreendimento: string | null;
  unidade: string | null;
  comprador: string | null;
  valor_venda: number | null;
  corretor: string | null;
  coaphar: string | null;
  gerente: string | null;
  pct_corretor: number | null;
  comissao_bruta: number | null;
  adiant_corretor: number | null;
  bonus_corretor: number | null;
  comissao_liq_corretor: number | null;
  pct_gerente: number | null;
  comissao_ger_bruta: number | null;
  adiant_gerente: number | null;
  bonus_gerente: number | null;
  comissao_liq_gerente: number | null;
  status: string | null;
  mes_ano: string | null;
  observacoes: string | null;
  row_hash: string;
}

function hashRow(parts: (string | null)[]): string {
  // simple deterministic hash
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export function parseSheetRows(
  values: unknown[][],
  defaults: { pctCorretor: number; pctGerente: number },
): SaleRow[] {
  if (!values || values.length === 0) return [];
  const rows = values.slice(1); // skip header
  const out: SaleRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = parseDate(row[0]);
    const empreendimento = (row[1] as string) || null;
    const unidade = row[2] != null ? String(row[2]) : null;
    const comprador = (row[3] as string) || null;
    const valor_venda = parseNumber(row[4]);
    if (!valor_venda || !empreendimento) continue;

    const pct_corretor = parsePct(row[8]) ?? defaults.pctCorretor;
    const pct_gerente = parsePct(row[13]) ?? defaults.pctGerente;
    const comissao_bruta = parseNumber(row[9]) ?? valor_venda * pct_corretor;
    const adiant_corretor = parseNumber(row[10]) ?? 0;
    const bonus_corretor = parseNumber(row[11]) ?? 0;
    const comissao_liq_corretor =
      parseNumber(row[12]) ?? comissao_bruta - adiant_corretor + bonus_corretor;
    const comissao_ger_bruta = parseNumber(row[14]) ?? valor_venda * pct_gerente;
    const adiant_gerente = parseNumber(row[15]) ?? 0;
    const bonus_gerente = parseNumber(row[16]) ?? 0;
    const comissao_liq_gerente =
      parseNumber(row[17]) ?? comissao_ger_bruta - adiant_gerente + bonus_gerente;

    const sale: SaleRow = {
      data,
      empreendimento,
      unidade,
      comprador,
      valor_venda,
      corretor: (row[5] as string) || null,
      coaphar: (row[6] as string) || null,
      gerente: (row[7] as string) || null,
      pct_corretor,
      comissao_bruta,
      adiant_corretor,
      bonus_corretor,
      comissao_liq_corretor,
      pct_gerente,
      comissao_ger_bruta,
      adiant_gerente,
      bonus_gerente,
      comissao_liq_gerente,
      status: parseText(row[18]),
      mes_ano: row[19] ? String(row[19]) : data ? data.slice(0, 7) : null,
      observacoes: (row[20] as string) || null,
      row_hash: "",
    };
    sale.row_hash = hashRow([data, empreendimento, unidade, comprador, String(valor_venda)]);
    out.push(sale);
  }
  return out;
}

export function extractSpreadsheetId(input: string): string {
  if (!input) return "";
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}
