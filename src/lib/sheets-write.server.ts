// Server-only helpers to write back to the Google Sheet.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractSpreadsheetId } from "./sheets.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function parseNumber(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function normDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

interface SaleKey {
  data: string | null;
  empreendimento: string | null;
  unidade: string | null;
  comprador: string | null;
  valor_venda: number | null;
}

/**
 * Adiciona um valor de adiantamento na coluna K ("Adiant. Corr.") da venda na planilha.
 * Soma ao valor existente. Não lança erro — apenas registra falhas no console.
 */
export async function addAdvanceToSheet(sale: SaleKey, advance: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: cfgRows } = await supabaseAdmin.from("config_kv").select("key,value");
    const cfg: Record<string, unknown> = {};
    for (const r of cfgRows ?? []) cfg[r.key] = r.value;

    const spreadsheetId = extractSpreadsheetId((cfg.sheets_spreadsheet_id as string) || "");
    const fullRange = (cfg.sheets_range as string) || "Equipe Maicon!A:V";
    const tab = fullRange.split("!")[0];
    if (!spreadsheetId) return { ok: false, error: "Spreadsheet não configurada." };

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const SHEETS_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    if (!LOVABLE_API_KEY || !SHEETS_KEY) return { ok: false, error: "Google Sheets não conectado." };

    const readUrl = `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${fullRange}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const readRes = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": SHEETS_KEY },
    });
    if (!readRes.ok) return { ok: false, error: `Read failed ${readRes.status}` };
    const json = (await readRes.json()) as { values?: unknown[][] };
    const values = json.values ?? [];

    // Localiza a linha (rows começam em 1; row 1 é cabeçalho, dados começam em row 2)
    let rowIndex = -1; // 0-based index dentro de `values`
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      const rData = normDate(r[0]);
      const rEmp = norm(r[1]);
      const rUni = norm(r[2]);
      const rComp = norm(r[3]);
      const rVal = parseNumber(r[4]);
      if (
        rData === sale.data &&
        rEmp === norm(sale.empreendimento) &&
        rUni === norm(sale.unidade) &&
        rComp === norm(sale.comprador) &&
        Math.abs(rVal - (sale.valor_venda ?? 0)) < 0.01
      ) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex < 0) return { ok: false, error: "Linha da venda não encontrada na planilha." };

    const sheetRow = rowIndex + 1; // 1-based
    const currentAdv = parseNumber(values[rowIndex]?.[10]);
    const newAdv = currentAdv + advance;

    const writeRange = `${tab}!K${sheetRow}`;
    const writeUrl = `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`;
    const writeRes = await fetch(writeUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SHEETS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range: writeRange, majorDimension: "ROWS", values: [[newAdv]] }),
    });
    if (!writeRes.ok) {
      const body = await writeRes.text();
      return { ok: false, error: `Write failed ${writeRes.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
