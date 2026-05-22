import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { createDistrato } from "@/lib/distratos.functions";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DistratoButton({
  saleId,
  comprador,
  totalPago,
  disabled,
}: {
  saleId: string;
  comprador: string | null | undefined;
  totalPago: number;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createDistrato);
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  const mut = useMutation({
    mutationFn: (v: { sale_id: string; motivo: string; observacao_financeiro?: string }) => fn({ data: v }),
    onSuccess: () => {
      toast.success("Distrato registrado.");
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      qc.invalidateQueries({ queryKey: ["distratos"] });
      setOpen(false);
      setMotivo("");
      setObs("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (totalPago <= 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-[11px]"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Registrar distrato — corretor deverá devolver valores pagos"
      >
        <Ban className="w-3 h-3 mr-1" /> Distrato
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar distrato</DialogTitle>
            <DialogDescription>
              Esta venda será marcada como distratada. O corretor deverá devolver à empresa todo o valor já pago.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</div>
            <div className="font-medium">{comprador ?? "—"}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Valor a devolver</div>
            <div className="font-display text-2xl font-semibold text-destructive">{BRL(totalPago)}</div>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo do distrato *</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={2000} />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 3 || mut.isPending}
              onClick={() => mut.mutate({ sale_id: saleId, motivo, observacao_financeiro: obs || undefined })}
            >
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar distrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
