import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  History,
  FileText,
  CheckCircle2,
  Receipt,
  CircleDollarSign,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";

/* ─────────── tipos genéricos ─────────── */

export type TimelineCommissionRequest = {
  id: string;
  tipo: string; // "adiantamento" | "comissao_final"
  status: string; // "pendente" | "aprovado" | "negado" | "pago"
  valor_solicitado: number | null;
  created_at: string;
  decided_at: string | null;
  paid_at: string | null;
  motivo_negacao?: string | null;
  observacao_corretor?: string | null;
  observacao_financeiro?: string | null;
  requester_role?: string | null;
};

export type TimelineNFRequest = {
  id: string;
  status: string; // "solicitada" | "emitida" | "recebida" | "paga" | "cancelada"
  valor_nf: number | null;
  created_at: string;
  emitida_at: string | null;
  recebida_at: string | null;
  paga_at: string | null;
  cancelada_at: string | null;
  numero_nf?: string | null;
  requester_role?: string | null;
};

export type TimelineSaleSummary = {
  comprador?: string | null;
  empreendimento?: string | null;
  unidade?: string | null;
  data?: string | null;
  valor_venda?: number | null;
};

type Props = {
  sale?: TimelineSaleSummary;
  requests?: TimelineCommissionRequest[];
  nfs?: TimelineNFRequest[];
  triggerLabel?: string;
  className?: string;
};

/* ─────────── helpers ─────────── */

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function fmtDateTime(d: string | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) {
    const s = String(d).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
  }
  return dt.toLocaleDateString("pt-BR");
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = Math.max(0, Math.round((b - a) / 86_400_000));
  return diff;
}

function daysAgo(from: string | null | undefined) {
  return daysBetween(from, new Date().toISOString());
}

function elapsedLabel(days: number | null) {
  if (days == null) return null;
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function gapLabel(prev: string | null | undefined, curr: string | null | undefined) {
  const d = daysBetween(prev, curr);
  if (d == null) return null;
  if (d === 0) return "no mesmo dia";
  if (d === 1) return "1 dia depois";
  return `${d} dias depois`;
}

/* ─────────── timeline rendering ─────────── */

type Step = {
  key: string;
  label: string;
  icon: React.ReactNode;
  date: string | null;
  state: "done" | "current" | "pending" | "failed" | "skipped";
  hint?: string | null;
};

function stateColors(state: Step["state"]) {
  switch (state) {
    case "done":
      return {
        ring: "ring-emerald-500/40",
        bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
        line: "bg-emerald-500/50",
        text: "text-emerald-400",
      };
    case "current":
      return {
        ring: "ring-amber-500/40 animate-pulse",
        bg: "bg-amber-500/15 text-amber-400 border-amber-500/40",
        line: "bg-amber-500/30",
        text: "text-amber-400",
      };
    case "failed":
      return {
        ring: "ring-destructive/40",
        bg: "bg-destructive/15 text-destructive border-destructive/40",
        line: "bg-destructive/30",
        text: "text-destructive",
      };
    case "skipped":
      return {
        ring: "ring-muted-foreground/20",
        bg: "bg-muted/40 text-muted-foreground border-border",
        line: "bg-border",
        text: "text-muted-foreground line-through",
      };
    default:
      return {
        ring: "ring-border",
        bg: "bg-muted/30 text-muted-foreground border-border",
        line: "bg-border",
        text: "text-muted-foreground",
      };
  }
}

function StepRow({
  step,
  isLast,
  gapFromPrev,
}: {
  step: Step;
  isLast: boolean;
  gapFromPrev: string | null;
}) {
  const colors = stateColors(step.state);
  return (
    <div className="relative flex gap-3">
      {/* coluna do ícone com linha vertical */}
      <div className="relative flex flex-col items-center">
        <div
          className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border ring-2 ${colors.bg} ${colors.ring}`}
        >
          {step.icon}
        </div>
        {!isLast && (
          <div className={`mt-1 w-px flex-1 ${colors.line}`} style={{ minHeight: 38 }} />
        )}
      </div>

      {/* conteúdo */}
      <div className={`flex-1 ${isLast ? "pb-1" : "pb-5"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div className={`text-sm font-semibold ${colors.text}`}>{step.label}</div>
          {step.date ? (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {fmtDateTime(step.date) ?? fmtDate(step.date)}
            </div>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {step.state === "failed" ? "negado" : step.state === "skipped" ? "—" : "pendente"}
            </Badge>
          )}
        </div>
        {(step.hint || (step.date && step.state === "done")) && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {step.hint ??
              (gapFromPrev ? gapFromPrev : (() => {
                const d = daysAgo(step.date);
                return d == null ? null : elapsedLabel(d);
              })())}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── card por solicitação ─────────── */

function buildCommissionSteps(
  r: TimelineCommissionRequest,
  matchedNf?: TimelineNFRequest | null,
): Step[] {
  const negado = r.status === "negado";
  const aprovado = r.status === "aprovado" || r.status === "pago";
  const pago = r.status === "pago" || (matchedNf?.status === "paga" && !!matchedNf?.paga_at);

  const nfEmitDate = matchedNf?.emitida_at ?? null;
  const nfEmitted = !!nfEmitDate;
  const pagoDate = r.paid_at ?? matchedNf?.paga_at ?? null;

  const steps: Step[] = [];

  steps.push({
    key: "solicitado",
    label: "Solicitação enviada",
    icon: <FileText className="h-4 w-4" />,
    date: r.created_at,
    state: "done",
  });

  steps.push({
    key: "aprovacao",
    label: negado ? "Pedido negado" : "Aprovação do financeiro",
    icon: negado ? (
      <XCircle className="h-4 w-4" />
    ) : aprovado ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : (
      <Clock className="h-4 w-4" />
    ),
    date: r.decided_at,
    state: negado ? "failed" : aprovado ? "done" : "current",
    hint: negado && r.motivo_negacao ? `Motivo: ${r.motivo_negacao}` : null,
  });

  if (!negado) {
    steps.push({
      key: "nf",
      label: nfEmitted ? "Nota fiscal enviada" : "Nota fiscal",
      icon: <Receipt className="h-4 w-4" />,
      date: nfEmitDate,
      state: nfEmitted
        ? "done"
        : aprovado && !pago
          ? "current"
          : pago
            ? "skipped"
            : "pending",
      hint: nfEmitted
        ? matchedNf?.numero_nf
          ? `NF nº ${matchedNf.numero_nf}`
          : null
        : aprovado && !pago && !nfEmitted
          ? "Aguardando emissão da NF"
          : null,
    });

    steps.push({
      key: "pago",
      label: pago ? "Pagamento concluído" : "Pagamento",
      icon: <CircleDollarSign className="h-4 w-4" />,
      date: pagoDate,
      state: pago ? "done" : aprovado ? "current" : "pending",
    });
  }

  return steps;
}

function RequestCard({
  r,
  matchedNf,
}: {
  r: TimelineCommissionRequest;
  matchedNf?: TimelineNFRequest | null;
}) {
  const steps = buildCommissionSteps(r, matchedNf);
  const tipoLabel = r.tipo === "adiantamento" ? "Adiantamento" : "Comissão final";
  const statusLabel =
    r.status === "pago"
      ? "Pago"
      : r.status === "aprovado"
        ? "Aprovado"
        : r.status === "negado"
          ? "Negado"
          : "Pendente";
  const statusTone =
    r.status === "pago"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
      : r.status === "aprovado"
        ? "bg-sky-500/15 text-sky-400 border-sky-500/40"
        : r.status === "negado"
          ? "bg-destructive/15 text-destructive border-destructive/40"
          : "bg-amber-500/15 text-amber-400 border-amber-500/40";

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold">{tipoLabel}</div>
          <div className="text-xs text-muted-foreground">
            {BRL(r.valor_solicitado)} ·{" "}
            <span className="capitalize">{r.requester_role ?? "corretor"}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] ${statusTone}`}>
          {statusLabel}
        </Badge>
      </div>
      <div>
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].date : null;
          const gap =
            step.state === "done" && prev ? gapLabel(prev, step.date) : null;
          return (
            <StepRow
              key={step.key}
              step={step}
              isLast={i === steps.length - 1}
              gapFromPrev={gap}
            />
          );
        })}
      </div>
    </div>
  );
}

function StandaloneNFCard({ n }: { n: TimelineNFRequest }) {
  const emitted = !!n.emitida_at;
  const received = !!n.recebida_at;
  const paga = n.status === "paga" || !!n.paga_at;
  const cancelada = n.status === "cancelada" || !!n.cancelada_at;

  const steps: Step[] = [
    {
      key: "sol",
      label: "NF solicitada",
      icon: <FileText className="h-4 w-4" />,
      date: n.created_at,
      state: "done",
    },
    {
      key: "emit",
      label: emitted ? "NF emitida" : "Emissão da NF",
      icon: <Receipt className="h-4 w-4" />,
      date: n.emitida_at,
      state: cancelada ? "failed" : emitted ? "done" : "current",
      hint: n.numero_nf ? `Nº ${n.numero_nf}` : null,
    },
    {
      key: "recv",
      label: received ? "NF recebida pelo financeiro" : "Recebimento",
      icon: <CheckCircle2 className="h-4 w-4" />,
      date: n.recebida_at,
      state: cancelada ? "skipped" : received ? "done" : emitted ? "current" : "pending",
    },
    {
      key: "pago",
      label: paga ? "Pagamento concluído" : "Pagamento",
      icon: <CircleDollarSign className="h-4 w-4" />,
      date: n.paga_at,
      state: cancelada ? "skipped" : paga ? "done" : received ? "current" : "pending",
    },
  ];

  const statusLabel = cancelada
    ? "Cancelada"
    : paga
      ? "Paga"
      : received
        ? "Recebida"
        : emitted
          ? "Emitida"
          : "Solicitada";
  const tone = cancelada
    ? "bg-destructive/15 text-destructive border-destructive/40"
    : paga
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
      : received
        ? "bg-sky-500/15 text-sky-400 border-sky-500/40"
        : "bg-amber-500/15 text-amber-400 border-amber-500/40";

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold">Nota fiscal</div>
          <div className="text-xs text-muted-foreground">
            {BRL(n.valor_nf)} ·{" "}
            <span className="capitalize">{n.requester_role ?? "corretor"}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] ${tone}`}>
          {statusLabel}
        </Badge>
      </div>
      <div>
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].date : null;
          const gap =
            step.state === "done" && prev ? gapLabel(prev, step.date) : null;
          return (
            <StepRow
              key={step.key}
              step={step}
              isLast={i === steps.length - 1}
              gapFromPrev={gap}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── componente principal ─────────── */

export function SaleTimelineButton({
  sale,
  requests = [],
  nfs = [],
  triggerLabel = "Linha do tempo",
  className,
}: Props) {
  const { matchedNfIds, sortedRequests, standaloneNfs } = useMemo(() => {
    const sortedReqs = [...requests].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const usedNfs = new Set<string>();
    // associa NF "próxima" no tempo a cada commission_request
    for (const r of sortedReqs) {
      const candidate = nfs.find(
        (n) =>
          !usedNfs.has(n.id) &&
          (n.requester_role ?? "corretor") === (r.requester_role ?? "corretor") &&
          Math.abs(new Date(n.created_at).getTime() - new Date(r.created_at).getTime()) <
            1000 * 60 * 60 * 24 * 60,
      );
      if (candidate) usedNfs.add(candidate.id);
    }
    const standalone = nfs.filter((n) => !usedNfs.has(n.id));
    return {
      matchedNfIds: usedNfs,
      sortedRequests: sortedReqs,
      standaloneNfs: standalone,
    };
  }, [requests, nfs]);

  const totalEvents = requests.length + standaloneNfs.length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 gap-1.5 text-[11px] ${className ?? ""}`}
          title="Ver linha do tempo das solicitações desta venda"
        >
          <History className="h-3 w-3" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Linha do tempo da venda</SheetTitle>
          {sale && (
            <SheetDescription asChild>
              <div className="text-xs space-y-0.5">
                {sale.comprador && (
                  <div className="text-foreground font-medium">{sale.comprador}</div>
                )}
                {(sale.empreendimento || sale.unidade) && (
                  <div>
                    {sale.empreendimento ?? "—"}
                    {sale.unidade ? ` · ${sale.unidade}` : ""}
                  </div>
                )}
                {(sale.data || sale.valor_venda) && (
                  <div className="text-muted-foreground">
                    {sale.data && `Venda ${fmtDate(sale.data)}`}
                    {sale.data && sale.valor_venda ? " · " : ""}
                    {sale.valor_venda ? BRL(sale.valor_venda) : ""}
                  </div>
                )}
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {totalEvents === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <div className="text-sm text-muted-foreground">
                Nenhuma solicitação registrada para esta venda.
              </div>
            </div>
          ) : (
            <>
              {sortedRequests.map((r) => {
                const matched = nfs.find(
                  (n) =>
                    matchedNfIds.has(n.id) &&
                    (n.requester_role ?? "corretor") === (r.requester_role ?? "corretor") &&
                    Math.abs(
                      new Date(n.created_at).getTime() - new Date(r.created_at).getTime(),
                    ) <
                      1000 * 60 * 60 * 24 * 60,
                );
                return <RequestCard key={r.id} r={r} matchedNf={matched} />;
              })}
              {standaloneNfs.map((n) => (
                <StandaloneNFCard key={n.id} n={n} />
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
