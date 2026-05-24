import { motion } from "framer-motion";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveSync } from "@/hooks/use-live-sync";

function timeAgo(d: Date | null) {
  if (!d) return "nunca";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}m`;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function LiveSyncBadge() {
  const { state, lastAt, lastError, rows, refresh } = useLiveSync();

  const color =
    state === "syncing" ? "#007FFF" :
    state === "error" ? "#FF6B6B" :
    state === "ok" ? "#15CAB6" : "#9ca3af";

  const Icon =
    state === "syncing" ? Loader2 :
    state === "error" ? AlertCircle :
    state === "ok" ? CheckCircle2 : RefreshCw;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card px-3 py-1.5 flex items-center gap-2 text-xs"
      title={lastError ?? `Sincronização ao vivo · ${rows ?? 0} vendas`}
    >
      <span className="relative flex w-2 h-2">
        <span className="absolute inset-0 rounded-full pulse-dot" style={{ background: color }} />
      </span>
      <span className="text-muted-foreground hidden sm:inline">Live · </span>
      <Icon className={`w-3.5 h-3.5 ${state === "syncing" ? "animate-spin" : ""}`} style={{ color }} />
      <span className="font-medium hidden md:inline">
        {state === "error" ? "Erro" : state === "syncing" ? "Sincronizando" : "Sincronizado"}
      </span>
      <span className="text-muted-foreground">{timeAgo(lastAt)}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 ml-1"
        onClick={() => refresh()}
        disabled={state === "syncing"}
        title="Atualizar agora"
      >
        <RefreshCw className={`w-3 h-3 ${state === "syncing" ? "animate-spin" : ""}`} />
      </Button>
    </motion.div>
  );
}
