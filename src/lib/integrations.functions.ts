import { createServerFn } from "@tanstack/react-start";

export interface ConnectorStatus {
  sheets: boolean;
  calendar: boolean;
  lovable: boolean;
  drive: boolean;
  gemini: boolean;
  supabase: boolean;
}

export const checkConnectorStatus = createServerFn({ method: "GET" })
  .handler(async () => {
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
