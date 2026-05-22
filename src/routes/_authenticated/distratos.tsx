import { createFileRoute } from "@tanstack/react-router";
import { DistratosPanel } from "@/components/distratos/DistratosPanel";

export const Route = createFileRoute("/_authenticated/distratos")({
  component: DistratosPage,
  head: () => ({ meta: [{ title: "Distratos · Gestão Comercial" }] }),
});

function DistratosPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Distratos</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Distratos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendas distratadas e valores a devolver à empresa.
        </p>
      </div>
      <DistratosPanel />
    </div>
  );
}
