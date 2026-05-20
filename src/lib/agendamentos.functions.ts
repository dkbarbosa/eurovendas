import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CALENDAR_ID =
  "839c08efcb01ccc668216d2172545dca8526f0bd349d62328beeba02792ac495@group.calendar.google.com";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

export interface AgendamentoEvent {
  id: string;
  summary: string;
  description: string | null;
  status: string;
  start: string | null; // ISO
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  creatorEmail: string | null;
  created: string | null;
  updated: string | null;
}

const InputSchema = z.object({
  // janela ampla por padrão: -180d até +180d
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

export const listAgendamentos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const CAL_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
    if (!LOVABLE_API_KEY) return { ok: false as const, events: [], error: "LOVABLE_API_KEY ausente" };
    if (!CAL_KEY) return { ok: false as const, events: [], error: "Google Calendar não conectado" };

    const now = Date.now();
    const timeMin = data.timeMin ?? new Date(now - 1000 * 60 * 60 * 24 * 180).toISOString();
    const timeMax = data.timeMax ?? new Date(now + 1000 * 60 * 60 * 24 * 180).toISOString();

    const events: AgendamentoEvent[] = [];
    let pageToken: string | undefined;
    const calId = encodeURIComponent(CALENDAR_ID);
    let safety = 0;

    try {
      do {
        const url = new URL(`${GATEWAY}/calendars/${calId}/events`);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("timeMin", timeMin);
        url.searchParams.set("timeMax", timeMax);
        url.searchParams.set("maxResults", "2500");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": CAL_KEY,
          },
        });
        if (!res.ok) {
          const body = await res.text();
          return { ok: false as const, events, error: `Calendar API ${res.status}: ${body.slice(0, 200)}` };
        }
        const json = (await res.json()) as {
          items?: Array<Record<string, unknown>>;
          nextPageToken?: string;
        };
        for (const it of json.items ?? []) {
          const start = it.start as { dateTime?: string; date?: string } | undefined;
          const end = it.end as { dateTime?: string; date?: string } | undefined;
          const creator = it.creator as { email?: string } | undefined;
          events.push({
            id: String(it.id ?? ""),
            summary: String(it.summary ?? "(sem título)"),
            description: (it.description as string | undefined) ?? null,
            status: String(it.status ?? "confirmed"),
            start: start?.dateTime ?? start?.date ?? null,
            end: end?.dateTime ?? end?.date ?? null,
            allDay: !!start?.date && !start?.dateTime,
            htmlLink: (it.htmlLink as string | undefined) ?? null,
            creatorEmail: creator?.email ?? null,
            created: (it.created as string | undefined) ?? null,
            updated: (it.updated as string | undefined) ?? null,
          });
        }
        pageToken = json.nextPageToken;
        safety += 1;
      } while (pageToken && safety < 20);

      return { ok: true as const, events, error: null };
    } catch (e) {
      return {
        ok: false as const,
        events,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
