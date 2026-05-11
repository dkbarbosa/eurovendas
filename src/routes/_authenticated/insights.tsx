import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/insights")({
  component: () => (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Inteligência</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Insights automáticos</h1>
      <div className="glass-card p-8 text-muted-foreground">
        Em breve — alertas, tendências e destaques calculados a cada sincronização.
      </div>
    </div>
  ),
});
