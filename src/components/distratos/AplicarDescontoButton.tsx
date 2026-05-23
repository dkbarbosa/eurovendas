import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Minus, Ban } from "lucide-react";
import { listPendenciasDistrato, aplicarDescontoDistrato } from "@/lib/distratos.functions";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AplicarDescontoButton({
  commissionRequestId,
  corretorUserId,
  valorSolicitado,
  descontoAtual,
}: {
  commissionRequestId: string;
  corretorUserId: string | null | undefined;
  valorSolicitado: number;
  descontoAtual: number;
}) {
  const qc = useQueryClient();
  const fnList = useServerFn(listPendenciasDistrato);
  const fnApply = useServerFn(aplicarDescontoDistrato);

  const [open, setOpen] = useState(false);
  const [distratoId, setDistratoId] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [obs, setObs] = useState("");

  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ["pendencias-distrato", corretorUserId],
    queryFn: () => fnList({ data: corretorUserId ? { corretor_user_id: corretorUserId } : undefined }),
    enabled: open && !!corretorUserId,
  });

  const selected = useMemo(
    () => pendencias.find((p) => p.id === distratoId) ?? null,
    [pendencias, distratoId],
  );

  const restanteRequest = Math.max(0, valorSolicitado - descontoAtual);

  const mut = useMutation({
    mutationFn: (v: { distrato_id: string; commission_request_id: string; valor_desconto: number; observacao?: string }) =>
      fnApply({ data: v }),
    onSuccess: () => {
      toast.success("Desconto vinculado ao pedido.");
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      qc.invalidateQueries({ queryKey: ["distratos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-distrato"] });
      setOpen(false);
      setDistratoId(""); setValor(""); setObs("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!corretorUserId) return null;

  const valorNum = Number((valor || "").replace(",", "."));
  const maxApply = selected ? Math.min(selected.saldo_restante, restanteRequest) : 0;
  const canSubmit = !!selected && valorNum > 0 && valorNum <= maxApply + 0.001;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px] border-rose-400/40 text-rose-300 hover:bg-rose-500/10"
        onClick={() => setOpen(true)}
        title="Vincular desconto de distrato"
      >
        <Minus className="w-3 h-3 mr-1" /> Vincular distrato
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular desconto de distrato</DialogTitle>
            <DialogDescription>
              O valor será abatido deste pedido no momento do pagamento.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Pedido</div>
              <div className="font-semibold">{BRL(valorSolicitado)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Já descontado</div>
              <div className="font-semibold text-rose-300">{BRL(descontoAtual)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Disponível</div>
              <div className="font-semibold text-emerald-300">{BRL(restanteRequest)}</div>
            </div>
          </div>

          {isLoading && <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
          {!isLoading && pendencias.length === 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground text-center">
              <Ban className="w-4 h-4 inline mr-1" /> Este corretor não possui pendências de distrato.
            </div>
          )}

          {pendencias.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pendência *</Label>
              <div className="max-h-48 overflow-auto rounded-lg border border-border/60 divide-y divide-border/40">
                {pendencias.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setDistratoId(p.id); setValor(String(Math.min(p.saldo_restante, restanteRequest).toFixed(2))); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 transition ${distratoId === p.id ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.comprador ?? "—"}</div>
                        <div className="text-muted-foreground text-[10px] truncate">{p.empreendimento} / {p.unidade}</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="font-semibold text-destructive">{BRL(p.saldo_restante)}</div>
                        <Badge variant="outline" className="text-[9px]">saldo</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <>
              <div className="space-y-1.5">
                <Label>Valor do desconto *</Label>
                <Input
                  type="number" step="0.01" min="0" max={maxApply}
                  value={valor} onChange={(e) => setValor(e.target.value)}
                  className="text-base font-semibold"
                />
                <div className="text-[11px] text-muted-foreground">
                  Máximo aplicável: <b>{BRL(maxApply)}</b>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={!canSubmit || mut.isPending}
              onClick={() => mut.mutate({
                distrato_id: distratoId,
                commission_request_id: commissionRequestId,
                valor_desconto: valorNum,
                observacao: obs || undefined,
              })}
            >
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar desconto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
