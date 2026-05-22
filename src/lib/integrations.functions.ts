import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ConnectorStatus {
  sheets: boolean;
  calendar: boolean;
  lovable: boolean;
  drive: boolean;
  gemini: boolean;
  supabase: boolean;
}

export const checkConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Apenas usuários autenticados podem consultar o status. Restringe a admins.
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Apenas administradores podem consultar conexões.");

    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    const calendarKey = process.env.GOOGLE_CALENDAR_API_KEY;
    const driveKey = process.env.GOOGLE_DRIVE_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const supaUrl = process.env.SUPABASE_URL;
    const supaService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    return {
      sheets: !!sheetsKey && sheetsKey.length > 0,
      calendar: !!calendarKey && calendarKey.length > 0,
      lovable: !!lovableKey && lovableKey.length > 0,
      drive: !!driveKey && driveKey.length > 0,
      gemini: !!lovableKey && lovableKey.length > 0,
      supabase: !!supaUrl && !!supaService,
    } as ConnectorStatus;
  });
