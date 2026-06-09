import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFromSheets } from "@/lib/sheets.functions";
import { useAuth } from "@/lib/auth";

export type SyncState = "idle" | "syncing" | "ok" | "error";

const INTERVAL_MS = 90_000;

export function useLiveSync() {
  const { isAdmin, isDiretor, isGerente, isFinanceiro, session } = useAuth();
  const canSync = isAdmin || isDiretor || isGerente || isFinanceiro;
  const qc = useQueryClient();
  const sync = useServerFn(syncFromSheets);
  const [state, setState] = useState<SyncState>("idle");
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [rows, setRows] = useState<number | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    if (running.current || !session?.access_token) return;
    running.current = true;
    if (mounted.current) setState("syncing");
    try {
      const r = (await sync({})) as { ok: boolean; rows: number; error?: string };
      if (!mounted.current) return;
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
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
      qc.invalidateQueries({ queryKey: ["nf-eligible"] });
      qc.invalidateQueries({ queryKey: ["all-nfs"] });
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      qc.invalidateQueries({ queryKey: ["distratos"] });
    } catch (e) {
      if (!mounted.current) return;
      const msg = e instanceof Response ? await e.text() : e instanceof Error ? e.message : String(e);
      setLastError(msg);
      setState("error");
    } finally {
      running.current = false;
    }
  }, [sync, qc, session?.access_token]);

  useEffect(() => {
    mounted.current = true;
    if (!isAdmin || !session) return;
    run();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAdmin, session, run]);

  return { state, lastAt, lastError, rows, refresh: run };
}
