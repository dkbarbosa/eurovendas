import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFromSheets } from "@/lib/sheets.functions";
import { useAuth } from "@/lib/auth";

export type SyncState = "idle" | "syncing" | "ok" | "error";

const INTERVAL_MS = 90_000;

export function useLiveSync() {
  const { isAdmin, session } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(syncFromSheets);
  const [state, setState] = useState<SyncState>("idle");
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [rows, setRows] = useState<number | null>(null);
  const running = useRef(false);

  async function run() {
    if (running.current || !session?.access_token) return;
    running.current = true;
    setState("syncing");
    try {
      const r = (await sync({ headers: { Authorization: `Bearer ${session.access_token}` } })) as { ok: boolean; rows: number; error?: string };
      if (!r.ok) {
        setLastError(r.error ?? "Erro desconhecido");
        setState("error");
        return;
      }
      setRows(r.rows);
      setLastAt(new Date());
      setState("ok");
      setLastError(null);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sales-all"] });
      qc.invalidateQueries({ queryKey: ["sync-log"] });
    } catch (e) {
      setLastError(e instanceof Response ? await e.text() : e instanceof Error ? e.message : String(e));
      setState("error");
    } finally {
      running.current = false;
    }
  }

  useEffect(() => {
    if (!isAdmin || !session) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, session?.user?.id]);

  return { state, lastAt, lastError, rows, refresh: run };
}
