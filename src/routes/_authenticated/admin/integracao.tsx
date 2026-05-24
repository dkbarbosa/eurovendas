import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncFromSheets, updateSheetConfig } from "@/lib/sheets.functions";
import { checkConnectorStatus } from "@/lib/integrations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileSpreadsheet,
  CalendarDays,
  HardDrive,
  Sparkles,
  Database,
} from "lucide-react";

import { toast } from "sonner";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/integracao")({
  component: IntegPage,
});

type Ping = { ok: boolean; latencyMs: number | null; error?: string } | undefined;

function StatusBadge({ ping }: { ping: Ping }) {
  const connected = !!ping?.ok;
  const label = connected
    ? `Conectado${ping?.latencyMs != null ? ` · ${ping.latencyMs}ms` : ""}`
    : ping?.error ?? "Desconectado";
  return (
    <div className="flex items-center gap-2 mt-2" title={ping?.error}>
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-destructive"}`}
      >
        {connected && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping" />
        )}
      </span>
      <span className={`text-xs font-medium truncate max-w-[180px] ${connected ? "text-emerald-400" : "text-destructive"}`}>
        {label}
      </span>
    </div>
  );
}

function IntegPage() {
  const { isAdmin, session } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(syncFromSheets);
  const update = useServerFn(updateSheetConfig);
  const checkStatus = useServerFn(checkConnectorStatus);
  const [url, setUrl] = useState("");

  const { data: status } = useQuery({
    queryKey: ["connector-status"],
    queryFn: async () => checkStatus({}),
  });

  const { data: cfg } = useQuery({
    queryKey: ["config-int"],
    queryFn: async () => {
      const { data } = await supabase.from("config_kv").select("key,value");
      const map: Record<string, string> = {};
      for (const r of data ?? []) map[r.key] = String(r.value).replace(/^"|"$/g, "");
      if (!url && map.sheets_spreadsheet_id) setUrl(map.sheets_spreadsheet_id);
      return map;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["sync-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: () => update({ data: { spreadsheetId: url } }),
    onSuccess: () => {
      toast.success("URL salva.");
      qc.invalidateQueries({ queryKey: ["config-int"] });
    },
    onError: async (e: unknown) =>
      toast.error(e instanceof Response ? await e.text() : e instanceof Error ? e.message : String(e)),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      // Refresh status of ALL connectors first, then run the sheets sync.
      const [statusRes, syncRes] = await Promise.all([
        checkStatus({}).catch((e) => ({ __err: e })),
        sync({}).catch((e) => ({ __err: e })),
      ]);
      return { statusRes, syncRes } as {
        statusRes: { __err?: unknown } | Awaited<ReturnType<typeof checkStatus>>;
        syncRes: { __err?: unknown } | { ok: boolean; rows: number; error?: string };
      };
    },
    onSuccess: ({ syncRes }) => {
      qc.invalidateQueries({ queryKey: ["connector-status"] });
      qc.invalidateQueries({ queryKey: ["sync-log"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sales-all"] });

      if ("__err" in syncRes && syncRes.__err) {
        const e = syncRes.__err;
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      }
      const r = syncRes as { ok: boolean; rows: number; error?: string };
      if (!r.ok) {
        toast.error(r.error ?? "Falha ao sincronizar");
        return;
      }
      toast.success(`Conexões atualizadas · ${r.rows} vendas sincronizadas.`);
    },
    onError: async (e: unknown) =>
      toast.error(e instanceof Response ? await e.text() : e instanceof Error ? e.message : String(e)),
  });

  if (!isAdmin) return <div className="text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Administração</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as conexões com Google Sheets e Google Calendar.
        </p>
      </div>

      {/* Status dos conectores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.1 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Google Sheets</div>
            <StatusBadge ping={status?.sheets} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Google Calendar</div>
            <StatusBadge ping={status?.calendar} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Google Drive</div>
            <StatusBadge ping={status?.drive} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Gemini (Lovable AI)</div>
            <StatusBadge ping={status?.gemini} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Lovable Cloud</div>
            <StatusBadge ping={status?.supabase} />
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-4">
        <div className="text-sm font-medium mb-2">Google Sheets — Configuração</div>
        <div className="space-y-1.5">
          <Label htmlFor="url">URL ou ID da planilha</Label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          <p className="text-xs text-muted-foreground">Aba: {cfg?.sheets_range ?? "Equipe Maicon!A:U"}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !session?.access_token} variant="secondary">
            {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar URL
          </Button>
          <Button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !session?.access_token}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar agora
          </Button>
        </div>
      </motion.div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium">Histórico de sincronizações</div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          {logs.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma sincronização ainda.</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 text-sm">
              {l.status === "ok" ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : l.status === "error" ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {l.status === "ok"
                    ? `${fmtNum(l.rows_imported)} linhas importadas`
                    : l.status === "error"
                      ? l.error
                      : "Em execução…"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(l.started_at).toLocaleString("pt-BR")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
