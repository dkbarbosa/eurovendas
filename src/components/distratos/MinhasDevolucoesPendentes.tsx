import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyDistratoRecipientPendencias } from "@/lib/distratos.functions";
import { AlertTriangle, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROLE_LABEL: Record<string, string> = { corretor: "Corretor", gerente: "Gerente", diretor: "Gestão" };

export function MinhasDevolucoesPendentes({ compact = false }: { compact?: boolean }) {
  const fn = useServerFn(listMyDistratoRecipientPendencias);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["my-distrato-pendencias"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, r) => s + Number(r.saldo), 0);

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="w-4 h-4" />
        Você tem {data.length} devolução{data.length > 1 ? "ões" : ""} de distrato pendente{data.length > 1 ? "s" : ""} — total {BRL(total)}
      </div>
      <div className="space-y-1">
        {data.map((r) => {
          const isOpen = expanded === r.id;
          const msg =
            r.observacao_recebimento ??
            r.distrato?.observacao_financeiro ??
            r.distrato?.observacao_recebimento ??
            null;
          const motivo = r.distrato?.motivo ?? null;
          const created = r.created_at
            ? new Date(r.created_at).toLocaleDateString("pt-BR")
            : null;
          return (
            <div key={r.id} className="border-t border-destructive/20 pt-1.5">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full text-xs flex items-center justify-between gap-2 hover:bg-destructive/5 rounded px-1 py-0.5 transition"
              >
                <div className="min-w-0 text-left flex items-center gap-1.5">
                  {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role} · </span>
                  <span className="font-medium truncate">{r.distrato?.comprador ?? "—"}</span>
                  <span className="text-muted-foreground truncate"> · {r.distrato?.empreendimento ?? ""} / {r.distrato?.unidade ?? ""}</span>
                  {msg && <MessageSquare className="w-3 h-3 text-amber-300 shrink-0" />}
                </div>
                <span className="font-semibold text-destructive whitespace-nowrap">{BRL(r.saldo)}</span>
              </button>
              {isOpen && (
                <div className="mt-1.5 ml-4 space-y-1 text-[11px] text-muted-foreground">
                  {created && <div>Registrado em: <span className="text-foreground">{created}</span></div>}
                  <div>
                    Valor a devolver: <span className="text-foreground font-medium">{BRL(r.valor_devolver)}</span>
                    {Number(r.valor_devolvido) > 0 && (
                      <> · Já devolvido: <span className="text-emerald-300">{BRL(r.valor_devolvido)}</span></>
                    )}
                  </div>
                  {motivo && (
                    <div>Motivo do distrato: <span className="text-foreground">{motivo}</span></div>
                  )}
                  {msg && (
                    <div className="rounded border border-amber-400/30 bg-amber-500/5 p-2 mt-1">
                      <div className="text-[10px] uppercase tracking-wider text-amber-300/80 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Mensagem do financeiro
                      </div>
                      <div className="text-foreground whitespace-pre-wrap mt-0.5">{msg}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <p className="text-[11px] text-muted-foreground">Procure o financeiro para realizar a devolução.</p>
      )}
    </div>
  );
}
