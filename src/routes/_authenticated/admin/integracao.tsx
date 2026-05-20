import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncFromSheets, updateSheetConfig } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/integracao")({
  component: IntegPage,
});

function IntegPage() {
  const { isAdmin, session } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(syncFromSheets);
  const update = useServerFn(updateSheetConfig);
  const [url, setUrl] = useState("");

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
    refetchInterval: 5000,
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
    mutationFn: () => sync({}),
    onSuccess: (r: { ok: boolean; rows: number; error?: string }) => {
      if (!r.ok) {
        toast.error(r.error ?? "Falha ao sincronizar");
        return;
      }
      toast.success(`Sincronizado: ${r.rows} vendas.`);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sync-log"] });
    },
    onError: async (e: unknown) =>
      toast.error(e instanceof Response ? await e.text() : e instanceof Error ? e.message : String(e)),
  });

  if (!isAdmin) return <div className="text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Administração</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Integração com Google Sheets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cole a URL pública (compartilhada) da planilha. A aba lida será <code className="text-foreground">Equipe Maicon</code>.
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-4">
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
        <div className="text-xs text-muted-foreground border-t border-border pt-4">
          Pré-requisito: conector <strong>Google Sheets</strong> conectado no projeto. Caso ainda não esteja, peça ao seu Lovable para "conectar Google Sheets".
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
