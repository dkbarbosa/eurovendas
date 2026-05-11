import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractSpreadsheetId, parseSheetRows } from "./sheets.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function readConfig() {
  const { data } = await supabaseAdmin.from("config_kv").select("key,value");
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export const syncFromSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
    const { userId } = context;
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { ok: false, rows: 0, error: "Apenas administradores podem sincronizar." };

    const cfg = await readConfig();
    const spreadsheetIdRaw = (cfg.sheets_spreadsheet_id as string) || "";
    const range = (cfg.sheets_range as string) || "Equipe Maicon!A:U";
    const spreadsheetId = extractSpreadsheetId(spreadsheetIdRaw);
    if (!spreadsheetId) {
      return { ok: false, rows: 0, error: "Configure a URL/ID do Google Sheets em Integração antes de sincronizar." };
    }

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const SHEETS_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    if (!LOVABLE_API_KEY || !SHEETS_KEY) {
      return { ok: false, rows: 0, error: "Conecte o Google Sheets primeiro (botão 'Conectar Google Sheets' em Integração)." };
    }

    const { data: log } = await supabaseAdmin
      .from("sync_log")
      .insert({ status: "running" })
      .select("id")
      .single();
    const logId = log?.id;

    try {
      const url = `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": SHEETS_KEY,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Sheets API ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { values?: unknown[][] };
      const rows = parseSheetRows(json.values ?? [], {
        pctCorretor: Number(cfg.pct_corretor_default ?? 0.016),
        pctGerente: Number(cfg.pct_gerente_default ?? 0.007),
      });

      // Upsert by row_hash; also wipe stale rows not present anymore
      if (rows.length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from("sales")
          .upsert(rows, { onConflict: "row_hash" });
        if (upErr) throw upErr;
        const hashes = rows.map((r) => r.row_hash);
        await supabaseAdmin.from("sales").delete().not("row_hash", "in", `(${hashes.map((h) => `"${h}"`).join(",")})`);
      }

      if (logId) {
        await supabaseAdmin
          .from("sync_log")
          .update({ status: "ok", finished_at: new Date().toISOString(), rows_imported: rows.length })
          .eq("id", logId);
      }
      return { ok: true, rows: rows.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (logId) {
        await supabaseAdmin
          .from("sync_log")
          .update({ status: "error", finished_at: new Date().toISOString(), error: msg })
          .eq("id", logId);
      }
      throw new Error(msg);
    }
  });

export const updateSheetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { spreadsheetId: string; range?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");
    const id = extractSpreadsheetId(data.spreadsheetId);
    await supabaseAdmin
      .from("config_kv")
      .upsert({ key: "sheets_spreadsheet_id", value: id, updated_at: new Date().toISOString() });
    if (data.range) {
      await supabaseAdmin
        .from("config_kv")
        .upsert({ key: "sheets_range", value: data.range, updated_at: new Date().toISOString() });
    }
    return { ok: true };
  });
