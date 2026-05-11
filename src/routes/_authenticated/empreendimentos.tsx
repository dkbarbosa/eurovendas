import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/empreendimentos")({
  component: () => (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Empreendimentos</h1>
      <div className="glass-card p-8 text-muted-foreground">Em breve — drill-down por empreendimento.</div>
    </div>
  ),
});
