import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyDistratoRecipientPendencias } from "@/lib/distratos.functions";
import { AlertTriangle } from "lucide-react";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROLE_LABEL: Record<string, string> = { corretor: "Corretor", gerente: "Gerente", diretor: "Gestão" };

export function MinhasDevolucoesPendentes() {
  const fn = useServerFn(listMyDistratoRecipientPendencias);
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
        {data.map((r) => (
          <div key={r.id} className="text-xs flex items-center justify-between gap-2 border-t border-destructive/20 pt-1.5">
            <div className="min-w-0">
              <span className="text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role} · </span>
              <span className="font-medium">{r.distrato?.comprador ?? "—"}</span>
              <span className="text-muted-foreground"> · {r.distrato?.empreendimento ?? ""} / {r.distrato?.unidade ?? ""}</span>
            </div>
            <span className="font-semibold text-destructive whitespace-nowrap">{BRL(r.saldo)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Procure o financeiro para realizar a devolução.</p>
    </div>
  );
}
