import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function assertAdmin(userId: string) {
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    throw new Response("Forbidden: admin role required", { status: 403 });
  }
}

export const syncFromSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    try {
      // Idempotência: aborta se já há sync em andamento iniciado há < 5 minutos.
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: inFlight } = await supabaseAdmin
        .from("sync_log")
        .select("id, started_at")
        .eq("status", "running")
        .gte("started_at", fiveMinAgo)
        .limit(1)
        .maybeSingle();
      if (inFlight) {
        return {
          ok: false,
          rows: 0,
          error: "Já existe uma sincronização em andamento. Aguarde a finalização.",
        };
      }

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

        const now = new Date().toISOString();
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK).map((row) => ({ ...row, updated_at: now }));
          const { error: upErr } = await supabaseAdmin
            .from("sales")
            .upsert(slice, { onConflict: "row_hash" });
          if (upErr) throw upErr;
        }

        const incomingHashes = new Set(rows.map((r) => r.row_hash));
        const { data: existing } = await supabaseAdmin.from("sales").select("id,row_hash");
        const stale = (existing ?? []).filter((s) => !incomingHashes.has(s.row_hash as string));
        if (stale.length > 0) {
          const staleIds = stale.map((s) => s.id as string);
          const [{ data: refsCR }, { data: refsNF }] = await Promise.all([
            supabaseAdmin.from("commission_requests").select("sale_id").in("sale_id", staleIds),
            supabaseAdmin.from("nf_requests").select("sale_id").in("sale_id", staleIds),
          ]);
          const referenced = new Set<string>([
            ...(refsCR ?? []).map((r) => r.sale_id as string),
            ...(refsNF ?? []).map((r) => r.sale_id as string),
          ]);
          const deletable = staleIds.filter((id) => !referenced.has(id));
          if (deletable.length > 0) {
            const { error: delErr } = await supabaseAdmin.from("sales").delete().in("id", deletable);
            if (delErr) throw delErr;
          }
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { spreadsheetId: string; range?: string }) => SheetConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
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
