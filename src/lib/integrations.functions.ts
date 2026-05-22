import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ConnectorPing {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface ConnectorStatus {
  sheets: ConnectorPing;
  calendar: ConnectorPing;
  drive: ConnectorPing;
  gemini: ConnectorPing;
  supabase: ConnectorPing;
  lovable: ConnectorPing;
  checkedAt: string;
}

const VERIFY_URL = "https://connector-gateway.lovable.dev/api/v1/verify_credentials";

async function pingGateway(connectionKey: string | undefined): Promise<ConnectorPing> {
  const lovable = process.env.LOVABLE_API_KEY;
  if (!lovable) return { ok: false, latencyMs: null, error: "LOVABLE_API_KEY ausente" };
  if (!connectionKey) return { ok: false, latencyMs: null, error: "Conector não conectado" };
  const started = Date.now();
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": connectionKey,
      },
    });
    const elapsed = Date.now() - started;
    const body = (await res.json().catch(() => ({}))) as {
      outcome?: string;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, latencyMs: elapsed, error: body.error ?? `HTTP ${res.status}` };
    }
    if (body.outcome === "verified" || body.outcome === "skipped") {
      return { ok: true, latencyMs: elapsed };
    }
    return { ok: false, latencyMs: elapsed, error: body.error ?? body.outcome ?? "Falha" };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function pingSupabase(): Promise<ConnectorPing> {
  const started = Date.now();
  try {
    const { error } = await supabaseAdmin.from("config_kv").select("key", { head: true, count: "exact" }).limit(1);
    const elapsed = Date.now() - started;
    if (error) return { ok: false, latencyMs: elapsed, error: error.message };
    return { ok: true, latencyMs: elapsed };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const checkConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectorStatus> => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Apenas administradores podem consultar conexões.");

    const lovable = process.env.LOVABLE_API_KEY;
    const lovablePing: ConnectorPing = lovable
      ? { ok: true, latencyMs: 0 }
      : { ok: false, latencyMs: null, error: "LOVABLE_API_KEY ausente" };

    const [sheets, calendar, drive, supabase] = await Promise.all([
      pingGateway(process.env.GOOGLE_SHEETS_API_KEY),
      pingGateway(process.env.GOOGLE_CALENDAR_API_KEY),
      pingGateway(process.env.GOOGLE_DRIVE_API_KEY),
      pingSupabase(),
    ]);

    return {
      sheets,
      calendar,
      drive,
      gemini: lovablePing,
      lovable: lovablePing,
      supabase,
      checkedAt: new Date().toISOString(),
    };
  });
