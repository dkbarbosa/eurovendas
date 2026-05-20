import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractSpreadsheetId, parseSheetRows } from "./sheets.server";

const SheetConfigSchema = z.object({
  spreadsheetId: z.string().trim().min(1, "Informe a URL ou ID da planilha").max(2048),
  range: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9 _\-!:]+$/, "Range com caracteres inválidos")
    .optional(),
});


const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function toErrorMessage(error: unknown): Promise<string> {
  if (error instanceof Response) {
    const body = await error.text().catch(() => "");
    return body || `Erro de autenticação (${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return typeof error === "object" ? JSON.stringify(error) : String(error);
}

async function readConfig() {
  const { data } = await supabaseAdmin.from("config_kv").select("key,value");
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

async function requireAdmin() {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
  if (!token) return { ok: false as const, error: "Sessão expirada. Faça login novamente para sincronizar." };

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !auth.user?.id) return { ok: false as const, error: "Sessão inválida. Faça login novamente." };

  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return { ok: false as const, error: "Apenas administradores podem sincronizar." };

  return { ok: true as const, userId: auth.user.id };
}

export const syncFromSheets = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const admin = await requireAdmin();
      if (!admin.ok) return { ok: false, rows: 0, error: admin.error };

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

      // Full snapshot: wipe everything and reinsert. Garante consistência 1:1 com a planilha.
      const { error: delErr } = await supabaseAdmin.from("sales").delete().not("id", "is", null);
      if (delErr) throw delErr;
      if (rows.length > 0) {
        const now = new Date().toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("sales")
          .insert(rows.map((row) => ({ ...row, updated_at: now })));
        if (upErr) throw upErr;
      }

      if (logId) {
        await supabaseAdmin
          .from("sync_log")
          .update({ status: "ok", finished_at: new Date().toISOString(), rows_imported: rows.length })
          .eq("id", logId);
      }
      return { ok: true, rows: rows.length };
    } catch (e: unknown) {
      const msg = await toErrorMessage(e);
      if (logId) {
        await supabaseAdmin
          .from("sync_log")
          .update({ status: "error", finished_at: new Date().toISOString(), error: msg })
          .eq("id", logId);
      }
      return { ok: false, rows: 0, error: msg };
    }
    } catch (outer: unknown) {
      const msg = await toErrorMessage(outer);
      console.error("syncFromSheets fatal:", outer);
      return { ok: false, rows: 0, error: msg };
    }
  });

export const updateSheetConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { spreadsheetId: string; range?: string }) => SheetConfigSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    if (!admin.ok) return { ok: false, error: admin.error };
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
