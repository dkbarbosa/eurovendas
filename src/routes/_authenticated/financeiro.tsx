import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listAllRequests, decideRequest, markRequestPaid, deleteCommissionRequest, removeBonusFromRequest } from "@/lib/requests.functions";
import { listAllNFs, listEligibleSalesForNF, requestNF, confirmNFReceived, cancelNF, deleteNFRequest, downloadNFFile, markNFPaid, listDistratosForSale } from "@/lib/nf.functions";
import { listPendenciasDistrato, aplicarDescontoDistrato } from "@/lib/distratos.functions";
import { setSaleStatus } from "@/lib/sales.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CheckCircle2, XCircle, Wallet, Receipt, Clock, Search, FilePlus2, Trash2, Download, LayoutDashboard, TrendingUp, AlertTriangle, FileText, Hourglass, BadgeCheck, Ban, Paperclip } from "lucide-react";
import { motion } from "framer-motion";
import { DistratoButton } from "@/components/distratos/DistratoButton";
import { DistratosPanel } from "@/components/distratos/DistratosPanel";
import { AplicarDescontoButton } from "@/components/distratos/AplicarDescontoButton";


export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
  head: () => ({ meta: [{ title: "Financeiro · Gestão Comercial" }] }),
});

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

function FinanceiroPage() {
  const { isStaff, isFinanceiro, isAdmin } = useAuth();
  const allowed = isFinanceiro || isAdmin;

  if (!allowed) return <div className="text-muted-foreground">Acesso restrito ao setor financeiro.</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Setor Financeiro</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Painel Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Aprovação de adiantamentos e gestão de notas fiscais.</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard"><LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
          <TabsTrigger value="solicitar-nf">Solicitar NF</TabsTrigger>
          <TabsTrigger value="nfs">Notas Fiscais</TabsTrigger>
          <TabsTrigger value="distratos"><Ban className="w-3.5 h-3.5 mr-1.5" />Distratos</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="adiantamentos" className="mt-4"><AdvancesTab /></TabsContent>
        <TabsContent value="solicitar-nf" className="mt-4"><RequestNFTab /></TabsContent>
        <TabsContent value="nfs" className="mt-4"><NFTab /></TabsContent>
        <TabsContent value="distratos" className="mt-4"><DistratosPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// =========== DASHBOARD ===========
function DashboardTab() {
  const fnListReqs = useServerFn(listAllRequests);
  const fnListNFs = useServerFn(listAllNFs);

  const { data: reqs = [], isLoading: lr } = useQuery({
    queryKey: ["all-requests", "todos"],
    queryFn: () => fnListReqs({ data: undefined }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const { data: nfs = [], isLoading: ln } = useQuery({
    queryKey: ["all-nfs"],
    queryFn: () => fnListNFs(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const stats = useMemo(() => {
    const sum = (arr: typeof reqs, pred: (r: typeof reqs[number]) => boolean) =>
      arr.filter(pred).reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0);
    const cnt = (arr: typeof reqs, pred: (r: typeof reqs[number]) => boolean) => arr.filter(pred).length;

    const adiant = reqs.filter((r) => r.tipo === "adiantamento");
    const comiss = reqs.filter((r) => r.tipo === "comissao_final");

    return {
      pendentesCount: cnt(reqs, (r) => r.status === "pendente"),
      pendentesValor: sum(reqs, (r) => r.status === "pendente"),
      aprovadosCount: cnt(reqs, (r) => r.status === "aprovado"),
      aprovadosValor: sum(reqs, (r) => r.status === "aprovado"),
      pagosCount: cnt(reqs, (r) => r.status === "pago"),
      pagosValor: sum(reqs, (r) => r.status === "pago"),
      negadosCount: cnt(reqs, (r) => r.status === "negado"),
      negadosValor: sum(reqs, (r) => r.status === "negado"),

      adiantTotal: sum(adiant, () => true),
      adiantPagos: sum(adiant, (r) => r.status === "pago"),
      comissTotal: sum(comiss, () => true),
      comissPagos: sum(comiss, (r) => r.status === "pago"),

      nfSolicitadas: nfs.filter((n) => n.status === "solicitada").length,
      nfEmitidas: nfs.filter((n) => n.status === "emitida").length,
      nfRecebidas: nfs.filter((n) => n.status === "recebida").length,
      nfCanceladas: nfs.filter((n) => n.status === "cancelada").length,
    };
  }, [reqs, nfs]);

  // Top 5 corretores por valor pago
  const topCorretores = useMemo(() => {
    const map = new Map<string, { nome: string; valor: number; pedidos: number }>();
    for (const r of reqs) {
      if (r.status !== "pago") continue;
      const nome = r.corretor_profile?.display_name ?? r.corretor_profile?.email ?? "—";
      const cur = map.get(nome) ?? { nome, valor: 0, pedidos: 0 };
      cur.valor += Number(r.valor_solicitado) || 0;
      cur.pedidos += 1;
      map.set(nome, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [reqs]);

  // Últimos negados
  const ultNegados = useMemo(
    () =>
      reqs
        .filter((r) => r.status === "negado")
        .sort((a, b) => new Date(b.decided_at ?? b.created_at).getTime() - new Date(a.decided_at ?? a.created_at).getTime())
        .slice(0, 5),
    [reqs],
  );

  const isLoading = lr || ln;

  if (isLoading) {
    return (
      <div className="p-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-muted-foreground" /></div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Pendentes"
          value={BRL(stats.pendentesValor)}
          sub={`${stats.pendentesCount} pedido${stats.pendentesCount === 1 ? "" : "s"} aguardando`}
          icon={<Hourglass className="w-4 h-4" />}
          gradient="linear-gradient(135deg, oklch(0.75 0.16 75), oklch(0.62 0.18 50))"
          delay={0}
        />
        <KpiTile
          label="Aprovados a pagar"
          value={BRL(stats.aprovadosValor)}
          sub={`${stats.aprovadosCount} aguardando pagamento`}
          icon={<BadgeCheck className="w-4 h-4" />}
          gradient="linear-gradient(135deg, oklch(0.7 0.16 160), oklch(0.55 0.18 165))"
          delay={0.05}
        />
        <KpiTile
          label="Pagos"
          value={BRL(stats.pagosValor)}
          sub={`${stats.pagosCount} pagamento${stats.pagosCount === 1 ? "" : "s"} efetuado${stats.pagosCount === 1 ? "" : "s"}`}
          icon={<Wallet className="w-4 h-4" />}
          gradient="var(--gradient-primary)"
          delay={0.1}
        />
        <KpiTile
          label="Negados"
          value={BRL(stats.negadosValor)}
          sub={`${stats.negadosCount} pedido${stats.negadosCount === 1 ? "" : "s"} recusado${stats.negadosCount === 1 ? "" : "s"}`}
          icon={<XCircle className="w-4 h-4" />}
          gradient="linear-gradient(135deg, oklch(0.65 0.22 25), oklch(0.5 0.2 20))"
          delay={0.15}
        />
      </div>

      {/* Adiantamentos vs Comissão Final */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BreakdownCard
          title="Adiantamentos"
          icon={<TrendingUp className="w-4 h-4" />}
          total={stats.adiantTotal}
          pago={stats.adiantPagos}
        />
        <BreakdownCard
          title="Comissão Final"
          icon={<Wallet className="w-4 h-4" />}
          total={stats.comissTotal}
          pago={stats.comissPagos}
        />
      </div>

      {/* NF cards */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Notas Fiscais
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NFTile label="Solicitadas" value={stats.nfSolicitadas} color="text-amber-400" />
          <NFTile label="Emitidas" value={stats.nfEmitidas} color="text-sky-400" />
          <NFTile label="Recebidas" value={stats.nfRecebidas} color="text-emerald-400" />
          <NFTile label="Canceladas" value={stats.nfCanceladas} color="text-destructive" />
        </div>
      </div>

      {/* Top corretores + últimos negados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-card p-5">
          <div className="text-sm font-medium mb-1">Top 5 corretores · pagamentos</div>
          <div className="text-xs text-muted-foreground mb-4">Por valor total pago</div>
          {topCorretores.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Sem dados.</div>}
          <div className="space-y-2.5">
            {topCorretores.map((c, i) => {
              const max = topCorretores[0]?.valor || 1;
              const pct = (c.valor / max) * 100;
              return (
                <div key={c.nome}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="truncate"><span className="text-muted-foreground mr-1.5">{i + 1}.</span>{c.nome}</span>
                    <span className="font-semibold">{BRL(c.valor)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: "var(--gradient-primary)" }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{c.pedidos} pagamento{c.pedidos === 1 ? "" : "s"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="text-sm font-medium mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-destructive" /> Últimos pedidos negados
          </div>
          <div className="text-xs text-muted-foreground mb-4">5 mais recentes</div>
          {ultNegados.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido negado.</div>}
          <div className="space-y-2">
            {ultNegados.map((r) => (
              <div key={r.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.sale?.comprador ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.corretor_profile?.display_name ?? "—"} · {new Date(r.decided_at ?? r.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">{BRL(r.valor_solicitado)}</div>
                </div>
                {r.motivo_negacao && (
                  <div className="text-xs text-destructive mt-1.5 line-clamp-2"><b>Motivo:</b> {r.motivo_negacao}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label, value, sub, icon, gradient, delay = 0,
}: { label: string; value: string; sub: string; icon: React.ReactNode; gradient: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card p-4 relative overflow-hidden"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-20 blur-2xl" style={{ background: gradient }} />
      <div className="relative flex items-start justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-primary-foreground shadow" style={{ background: gradient }}>
          {icon}
        </div>
      </div>
      <div className="relative font-display text-2xl font-semibold tracking-tight">{value}</div>
      <div className="relative text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>
    </motion.div>
  );
}

function NFTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display text-3xl font-semibold tracking-tight mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function BreakdownCard({ title, icon, total, pago }: { title: string; icon: React.ReactNode; total: number; pago: number }) {
  const pct = total > 0 ? (pago / total) * 100 : 0;
  const restante = Math.max(0, total - pago);
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium flex items-center gap-1.5">{icon}{title}</div>
        <div className="text-xs text-muted-foreground">{pct.toFixed(0)}% pago</div>
      </div>
      <div className="h-2 rounded-full bg-secondary/60 overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{ background: "var(--gradient-primary)" }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Solicitado</div>
          <div className="font-semibold">{BRL(total)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pago</div>
          <div className="font-semibold text-emerald-400">{BRL(pago)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em aberto</div>
          <div className="font-semibold text-primary">{BRL(restante)}</div>
        </div>
      </div>
    </div>
  );
}

// =========== ADIANTAMENTOS ===========
function AdvancesTab() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const fnList = useServerFn(listAllRequests);
  const fnDecide = useServerFn(decideRequest);
  const fnPaid = useServerFn(markRequestPaid);
  const fnDel = useServerFn(deleteCommissionRequest);
  const fnDownload = useServerFn(downloadNFFile);
  const handleDownloadNF = async (id: string, which: "1" | "2" = "1") => {
    try {
      const res = await fnDownload({ data: { id, which } }) as { base64: string; contentType: string; filename: string };
      const bin = atob(res.base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: res.contentType }));
      const a = document.createElement("a");
      a.href = url; a.download = res.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const [statusFilter, setStatusFilter] = useState<"pendente" | "aprovado" | "negado" | "pago" | "todos">("pendente");
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["all-requests", statusFilter],
    queryFn: () => fnList({ data: statusFilter === "todos" ? undefined : { status: statusFilter } }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((r) =>
      [r.sale?.comprador, r.sale?.empreendimento, r.sale?.unidade, r.corretor_profile?.display_name, r.corretor_profile?.email]
        .some((v) => v?.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const [deny, setDeny] = useState<{ open: boolean; id: string | null; motivo: string }>({ open: false, id: null, motivo: "" });
  const [obs, setObs] = useState<{ open: boolean; id: string | null; action: "aprovar" | "pagar"; text: string }>({
    open: false, id: null, action: "aprovar", text: "",
  });
  // Distrato vinculado durante a aprovação
  const [aprovDesc, setAprovDesc] = useState<{ distratoId: string; valor: string; obs: string }>({ distratoId: "", valor: "", obs: "" });

  // Pedido em foco no diálogo de obs (para checar elegibilidade de distrato)
  const obsRequest = useMemo(() => data.find((r) => r.id === obs.id) ?? null, [data, obs.id]);
  const obsEligibleDistrato = !!(
    obsRequest &&
    obs.action === "aprovar" &&
    obsRequest.tipo === "comissao_final" &&
    (((obsRequest.sale?.status ?? "").toUpperCase() === "CAIXA") || !!obsRequest.nf_status)
  );

  const { data: aprovPendencias = [], isLoading: aprovPendLoading } = useQuery({
    queryKey: ["pendencias-distrato", obsRequest?.corretor_user_id ?? null],
    queryFn: () => fnListPend({ data: obsRequest?.corretor_user_id ? { corretor_user_id: obsRequest.corretor_user_id } : undefined }),
    enabled: obs.open && obsEligibleDistrato && !!obsRequest?.corretor_user_id,
  });

  const aprovSelected = aprovPendencias.find((p) => p.id === aprovDesc.distratoId) ?? null;
  const aprovValorReq = Number(obsRequest?.valor_solicitado) || 0;
  const aprovDescAtual = Number((obsRequest as { desconto_distrato?: number } | null)?.desconto_distrato) || 0;
  const aprovRestReq = Math.max(0, aprovValorReq - aprovDescAtual);
  const aprovMaxApply = aprovSelected ? Math.min(aprovSelected.saldo_restante, aprovRestReq) : 0;
  const aprovValorNum = Number((aprovDesc.valor || "").replace(",", "."));


  const decideMut = useMutation({
    mutationFn: async (v: { id: string; decision: "aprovado" | "negado"; motivo?: string; observacao?: string; descDistratoId?: string; descValor?: number; descObs?: string }) => {
      await fnDecide({ data: { id: v.id, decision: v.decision, motivo: v.motivo, observacao: v.observacao } });
      if (v.decision === "aprovado" && v.descDistratoId && v.descValor && v.descValor > 0) {
        await fnApplyDesc({
          data: {
            distrato_id: v.descDistratoId,
            commission_request_id: v.id,
            valor_desconto: v.descValor,
            observacao: v.descObs || undefined,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Decisão registrada.");
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      qc.invalidateQueries({ queryKey: ["distratos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-distrato"] });
      setDeny({ open: false, id: null, motivo: "" });
      setObs({ open: false, id: null, action: "aprovar", text: "" });
      setAprovDesc({ distratoId: "", valor: "", obs: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const payMut = useMutation({
    mutationFn: (v: { id: string; observacao?: string }) => fnPaid({ data: v }),
    onSuccess: () => {
      toast.success("Marcado como pago.");
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      setObs({ open: false, id: null, action: "aprovar", text: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => { toast.success("Excluído."); qc.invalidateQueries({ queryKey: ["all-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const fnRemoveBonus = useServerFn(removeBonusFromRequest);
  const removeBonusMut = useMutation({
    mutationFn: (v: { id: string; motivo?: string }) => fnRemoveBonus({ data: v }),
    onSuccess: () => { toast.success("Bônus removido. Cálculo atualizado."); qc.invalidateQueries({ queryKey: ["all-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const fnApplyDesc = useServerFn(aplicarDescontoDistrato);
  const fnListPend = useServerFn(listPendenciasDistrato);





  return (
    <>
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-lg w-fit">
          {(["pendente", "aprovado", "negado", "pago", "todos"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition ${statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar comprador, corretor…" className="pl-9" />
        </div>
      </div>

      <div className="glass-card p-2 overflow-x-auto">
        {isLoading && <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">Nenhum pedido.</div>
        )}
        {!isLoading && filtered.length > 0 && (() => {
          // Agrupa pedidos pela mesma venda
          const groups = new Map<string, typeof filtered>();
          for (const r of filtered) {
            const k = r.sale_id ?? r.id;
            if (!groups.has(k)) groups.set(k, [] as typeof filtered);
            groups.get(k)!.push(r);
          }
          const groupList = Array.from(groups.entries()).map(([k, items]) => ({
            key: k,
            items: [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
          })).sort((a, b) => {
            const la = a.items[a.items.length - 1].created_at;
            const lb = b.items[b.items.length - 1].created_at;
            return new Date(lb).getTime() - new Date(la).getTime();
          });

          return (
            <div className="space-y-4">
              {groupList.map(({ key, items }) => {
                const head = items[0];
                const comissaoLiq = Number(head.comissao_liq) || 0;
                const adiantadoTot = Number(head.adiantado_pago) || 0;
                const finalPago = Number(head.final_pago) || 0;
                const aReceber = Number(head.a_receber) || 0;
                const finalizado = comissaoLiq > 0 && aReceber === 0;

                // Saldo corrente p/ exibir "Restante após" cada pagamento
                let saldoCorrente = comissaoLiq;

                return (
                  <div key={key} className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden shadow-[0_1px_0_0_hsl(var(--border)/0.4)_inset]">
                    {/* Cabeçalho da venda */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 p-4 bg-gradient-to-br from-primary/[0.07] via-secondary/40 to-secondary/20 border-b border-border/60 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-primary/70 to-primary/20" />
                      <div className="min-w-0 pl-2">
                        <div className="font-display text-base md:text-lg font-semibold tracking-tight text-foreground truncate">{head.sale?.comprador ?? "—"}</div>
                        <div className="text-xs text-foreground/80 truncate mt-0.5">
                          <span className="text-foreground/95 font-medium">{head.sale?.empreendimento}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-foreground/95 font-medium">{head.sale?.unidade}</span>
                          <span className="text-muted-foreground"> · Venda </span>
                          <span className="text-foreground font-semibold">{BRL(head.sale?.valor_venda)}</span>
                        </div>
                        {/* Bloco de identificação: status da venda + sinal de negócio */}
                        <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-2">
                          <SaleStatusEditor saleId={head.sale?.id ?? null} status={head.sale?.status ?? null} canEdit />

                          <div className="inline-flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Sinal de negócio</span>
                            <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">{BRL(Number(head.sale?.valor_sinal_negocio) || 0)}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            Corretor: <span className="text-foreground font-medium">{head.corretor_profile?.display_name ?? head.sale?.corretor ?? "—"}</span>
                            {head.corretor_profile?.email && <span className="ml-1 text-muted-foreground/80">({head.corretor_profile.email})</span>}
                          </span>
                          {head.sale?.gerente && (
                            <span>
                              Gerente: <span className="text-foreground font-medium">{head.sale.gerente}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Comissão Liq.</div>
                          <div className="font-semibold text-foreground">{BRL(comissaoLiq)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Adiantado</div>
                          <div className={`font-semibold ${adiantadoTot > 0 ? "text-amber-300" : "text-muted-foreground"}`}>{BRL(adiantadoTot)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Comissão Paga</div>
                          <div className="font-semibold text-foreground">{BRL(finalPago)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">A Receber</div>
                          {finalizado ? (
                            <div className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />100% pago
                            </div>
                          ) : (
                            <div className={`font-semibold ${aReceber > 0 ? "text-primary" : "text-muted-foreground"}`}>{BRL(aReceber)}</div>
                          )}
                        </div>
                        {(adiantadoTot + finalPago) > 0 && (
                          <DistratoButton
                            saleId={head.sale_id ?? ""}
                            comprador={head.sale?.comprador}
                            totalPago={adiantadoTot + finalPago}
                          />
                        )}
                      </div>
                    </div>

                    {/* Pedidos desta venda */}
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="text-[10px] uppercase tracking-[0.12em] text-foreground/70 bg-secondary/30 border-b border-border/60">
                        <tr>
                          <th className="text-left px-3 py-2.5 w-24 font-semibold">Data</th>
                          <th className="text-left px-3 py-2.5 w-56 font-semibold">Tipo / Origem</th>
                          <th className="text-right px-3 py-2.5 w-32 font-semibold">Solicitado</th>
                          <th className="text-right px-3 py-2.5 w-44 font-semibold">Restante após</th>
                          <th className="text-left px-3 py-2.5 w-28 font-semibold">Status</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Obs</th>
                          <th className="px-3 py-2.5 w-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r) => {
                          const valor = Number(r.valor_solicitado) || 0;
                          const isPago = r.status === "pago";
                          if (isPago) saldoCorrente = Math.max(0, saldoCorrente - valor);
                          const restanteLabel = isPago
                            ? (saldoCorrente === 0 ? "Pagamento final — quitado" : `Restante: ${BRL(saldoCorrente)}`)
                            : "—";

                          return (
                            <tr key={r.id} className="border-t border-border/40 align-top">
                              <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1.5">
                                  {r.tipo === "adiantamento" ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_currentColor]" />
                                      Adiant.
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_currentColor]" />
                                      Comiss.
                                    </span>
                                  )}
                                  {(() => {
                                    const role = (r as { requester_role?: string }).requester_role;
                                    const gerProf = (r as { gerente_profile?: { display_name?: string | null; email?: string | null } | null }).gerente_profile;
                                    const corProf = (r as { corretor_profile?: { display_name?: string | null; email?: string | null } | null }).corretor_profile;
                                    if (role === "gerente") {
                                      const nome = gerProf?.display_name ?? gerProf?.email ?? head.sale?.gerente ?? "Gerente";
                                      return (
                                        <span
                                          className="inline-flex items-center gap-1 rounded-md border border-violet-400/50 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 w-fit shadow-[0_0_12px_-4px_hsl(280_80%_60%/0.4)]"
                                          title={`Solicitado pelo gerente ${nome}`}
                                        >
                                          <span className="uppercase tracking-wider text-[9px] opacity-80">Pedido do Gerente</span>
                                          <span className="text-violet-50">· {nome}</span>
                                        </span>
                                      );
                                    }
                                    const nome = corProf?.display_name ?? corProf?.email ?? head.sale?.corretor ?? "Corretor";
                                    return (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-md border border-sky-400/50 bg-gradient-to-br from-sky-500/20 to-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-sky-200 w-fit shadow-[0_0_12px_-4px_hsl(200_80%_60%/0.4)]"
                                        title={`Solicitado pelo corretor ${nome}`}
                                      >
                                        <span className="uppercase tracking-wider text-[9px] opacity-80">Pedido do Corretor</span>
                                        <span className="text-sky-50">· {nome}</span>
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{BRL(valor)}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                                {isPago ? (
                                  <span className={saldoCorrente === 0 ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                                    {restanteLabel}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                              <td className="px-3 py-2 max-w-[260px]">
                                <div className="flex flex-wrap gap-1 mb-1">
                                  <Badge variant="outline" className={`text-[10px] ${aReceber > 0 ? "bg-primary/10 text-primary border-primary/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>A receber: {BRL(aReceber)}</Badge>
                                  {Number(r.valor_sinal) > 0 && (
                                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-400 border-sky-500/30">
                                      Sinal: {BRL(r.valor_sinal)}
                                    </Badge>
                                  )}
                                  {Number(r.bonus_corretor) > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 pl-2 pr-0.5 py-0.5 text-[10px] text-fuchsia-300">
                                      <span>Bônus: <b>{BRL(r.bonus_corretor)}</b></span>
                                      {r.status !== "pago" && (
                                        <button
                                          type="button"
                                          title="Remover bônus (erro)"
                                          onClick={() => {
                                            if (confirm(`Remover bônus de ${BRL(r.bonus_corretor)} deste pedido? O cálculo será refeito sem o bônus.`)) {
                                              removeBonusMut.mutate({ id: r.id });
                                            }
                                          }}
                                          className="ml-0.5 w-4 h-4 rounded-sm hover:bg-fuchsia-500/20 inline-flex items-center justify-center text-fuchsia-300/80 hover:text-fuchsia-100 transition"
                                          disabled={removeBonusMut.isPending}
                                        >
                                          <XCircle className="w-3 h-3" />
                                        </button>
                                      )}
                                    </span>
                                  )}

                                  {(r as { comprovante_sinal_url?: string | null }).comprovante_sinal_url && (
                                    <a
                                      href={(r as { comprovante_sinal_url?: string | null }).comprovante_sinal_url ?? "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"
                                      title="Comprovante de sinal enviado pelo corretor"
                                    >
                                      <Paperclip className="w-3 h-3" /> Comprovante
                                    </a>
                                  )}
                                  {(r as { nf_info?: { id: string; numero: string | null; hasFile1: boolean; hasFile2: boolean } | null }).nf_info?.hasFile1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadNF((r as { nf_info: { id: string } }).nf_info.id, "1")}
                                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
                                      title={`Baixar nota fiscal${(r as { nf_info?: { numero?: string | null } }).nf_info?.numero ? ` #${(r as { nf_info: { numero: string } }).nf_info.numero}` : ""}`}
                                    >
                                      <Download className="w-3 h-3" /> Nota fiscal
                                    </button>
                                  )}
                                  {(r as { nf_info?: { id: string; hasFile2: boolean } | null }).nf_info?.hasFile2 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadNF((r as { nf_info: { id: string } }).nf_info.id, "2")}
                                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
                                      title="Baixar promissória"
                                    >
                                      <Download className="w-3 h-3" /> Promissória
                                    </button>
                                  )}
                                </div>
                                {r.observacao_corretor && (
                                  <div className="mt-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
                                    <div className="text-[10px] uppercase tracking-wide text-sky-300 font-semibold">💬 Mensagem do corretor</div>
                                    <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{r.observacao_corretor}</div>
                                  </div>
                                )}
                                {r.observacao_financeiro && (
                                  <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                                    <div className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">💬 Mensagem do financeiro</div>
                                    <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{r.observacao_financeiro}</div>
                                  </div>
                                )}
                                {r.motivo_negacao && (
                                  <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                                    <div className="text-[10px] uppercase tracking-wide text-destructive font-semibold">⚠ Motivo da negação</div>
                                    <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">{r.motivo_negacao}</div>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {r.status === "pendente" && (
                                  <div className="flex gap-1.5 justify-end">
                                    <Button size="sm" onClick={() => setObs({ open: true, id: r.id, action: "aprovar", text: "" })}
                                      style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Aprovar
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setDeny({ open: true, id: r.id, motivo: "" })}>
                                      <XCircle className="w-3.5 h-3.5 mr-1" />Negar
                                    </Button>
                                  </div>
                                )}
                                {r.status === "aprovado" && (() => {
                                  const nfOk = r.nf_status === "recebida";
                                  const desconto = Number((r as { desconto_distrato?: number }).desconto_distrato) || 0;
                                  const liquido = Math.max(0, valor - desconto);
                                  return (
                                    <div className="flex flex-col items-end gap-1.5">
                                      {desconto > 0 && (
                                        <div className="rounded-md border border-violet-400/50 bg-gradient-to-br from-violet-500/20 to-rose-500/10 px-2.5 py-1.5 shadow-sm">
                                          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-violet-200">
                                            <Ban className="w-3 h-3" /> Desc. distrato
                                          </div>
                                          <div className="flex items-baseline gap-1.5 mt-0.5">
                                            <span className="text-[11px] line-through text-muted-foreground">{BRL(valor)}</span>
                                            <span className="text-[11px] text-rose-300">− {BRL(desconto)}</span>
                                          </div>
                                          <div className="text-sm font-bold text-emerald-300">
                                            = {BRL(liquido)} <span className="text-[10px] font-normal text-emerald-300/80">líquido</span>
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex gap-1 items-center">
                                        <AplicarDescontoButton
                                          commissionRequestId={r.id}
                                          corretorUserId={r.corretor_user_id}
                                          valorSolicitado={valor}
                                          descontoAtual={desconto}
                                        />
                                        {!nfOk ? (
                                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                                            {r.nf_status === "emitida" ? "Aguardando recebimento da NF" : "Aguardando emissão da NF"}
                                          </Badge>
                                        ) : (
                                          <Button size="sm" onClick={() => setObs({ open: true, id: r.id, action: "pagar", text: "" })}>
                                            <Wallet className="w-3.5 h-3.5 mr-1" />Marcar pago {liquido !== valor ? `(${BRL(liquido)})` : ""}
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {isAdmin && (
                                  <Button size="sm" variant="ghost" className="text-destructive ml-1"
                                    onClick={() => { if (confirm("Excluir esta solicitação? (admin)")) delMut.mutate(r.id); }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Deny dialog */}
      <Dialog open={deny.open} onOpenChange={(o) => setDeny({ ...deny, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Negar pedido</DialogTitle><DialogDescription>O motivo será enviado ao corretor.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo da negação *</Label>
            <Textarea value={deny.motivo} onChange={(e) => setDeny({ ...deny, motivo: e.target.value })} rows={4} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeny({ open: false, id: null, motivo: "" })}>Cancelar</Button>
            <Button variant="destructive" disabled={!deny.motivo.trim() || decideMut.isPending}
              onClick={() => decideMut.mutate({ id: deny.id!, decision: "negado", motivo: deny.motivo })}>
              {decideMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Negar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Pay dialog */}
      <Dialog open={obs.open} onOpenChange={(o) => { setObs({ ...obs, open: o }); if (!o) setAprovDesc({ distratoId: "", valor: "", obs: "" }); }}>
        <DialogContent className={obsEligibleDistrato ? "max-w-xl" : undefined}>
          <DialogHeader>
            <DialogTitle>{obs.action === "aprovar" ? "Aprovar pedido" : "Marcar como pago"}</DialogTitle>
            <DialogDescription>
              {obsEligibleDistrato
                ? "Antes de aprovar, verifique se o corretor possui distrato pendente para devolução."
                : "Observação opcional para o corretor."}
            </DialogDescription>
          </DialogHeader>

          {obsEligibleDistrato && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Pedido</div>
                  <div className="font-semibold">{BRL(aprovValorReq)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Desc. atual</div>
                  <div className="font-semibold text-rose-300">{BRL(aprovDescAtual)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Líquido</div>
                  <div className="font-semibold text-emerald-300">
                    {BRL(Math.max(0, aprovRestReq - (aprovValorNum > 0 && aprovSelected ? aprovValorNum : 0)))}
                  </div>
                </div>
              </div>

              {aprovPendLoading && (
                <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
              )}
              {!aprovPendLoading && aprovPendencias.length === 0 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300 text-center">
                  Corretor sem distrato pendente.
                </div>
              )}
              {aprovPendencias.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Distrato para descontar (opcional)</Label>
                  <div className="max-h-40 overflow-auto rounded-lg border border-border/60 divide-y divide-border/40">
                    <button
                      type="button"
                      onClick={() => setAprovDesc({ distratoId: "", valor: "", obs: "" })}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 transition ${aprovDesc.distratoId === "" ? "bg-secondary/40" : ""}`}
                    >
                      <span className="text-muted-foreground">— Não vincular distrato —</span>
                    </button>
                    {aprovPendencias.map((p) => {
                      const sugerido = Math.min(p.saldo_restante, aprovRestReq);
                      const autoObs = `Desconto referente ao distrato da venda — Cliente: ${p.comprador ?? "—"} · ${p.empreendimento ?? "—"} / ${p.unidade ?? "—"}`;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setAprovDesc({ distratoId: p.id, valor: sugerido.toFixed(2), obs: autoObs })}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 transition ${aprovDesc.distratoId === p.id ? "bg-primary/10" : ""}`}
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
                      );
                    })}

                  </div>
                </div>
              )}

              {aprovSelected && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor a descontar *</Label>
                    <Input
                      type="number" step="0.01" min="0" max={aprovMaxApply}
                      value={aprovDesc.valor}
                      onChange={(e) => setAprovDesc({ ...aprovDesc, valor: e.target.value })}
                      className="text-base font-semibold"
                    />
                    <div className="text-[11px] text-muted-foreground">
                      Sugerido: <b>{BRL(Math.min(aprovSelected.saldo_restante, aprovRestReq))}</b> · Máx: <b>{BRL(aprovMaxApply)}</b>
                      {aprovValorNum > 0 && aprovValorNum < aprovSelected.saldo_restante && (
                        <span className="ml-2 text-amber-300">
                          Saldo restante do distrato: {BRL(aprovSelected.saldo_restante - aprovValorNum)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Observação do desconto (opcional)</Label>
                    <Textarea rows={2} value={aprovDesc.obs} onChange={(e) => setAprovDesc({ ...aprovDesc, obs: e.target.value })} maxLength={2000} />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observação para o corretor</Label>
            <Textarea value={obs.text} onChange={(e) => setObs({ ...obs, text: e.target.value })} rows={3} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setObs({ open: false, id: null, action: "aprovar", text: "" }); setAprovDesc({ distratoId: "", valor: "", obs: "" }); }}>Cancelar</Button>
            <Button
              disabled={
                decideMut.isPending || payMut.isPending ||
                (obsEligibleDistrato && !!aprovSelected && (!(aprovValorNum > 0) || aprovValorNum > aprovMaxApply + 0.001))
              }
              onClick={() => obs.action === "aprovar"
                ? decideMut.mutate({
                    id: obs.id!,
                    decision: "aprovado",
                    observacao: obs.text || undefined,
                    descDistratoId: aprovSelected ? aprovDesc.distratoId : undefined,
                    descValor: aprovSelected ? aprovValorNum : undefined,
                    descObs: aprovSelected ? aprovDesc.obs : undefined,
                  })
                : payMut.mutate({ id: obs.id!, observacao: obs.text || undefined })}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {(decideMut.isPending || payMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </>
  );
}

// =========== SOLICITAR NF ===========
function RequestNFTab() {
  const qc = useQueryClient();
  const fnList = useServerFn(listEligibleSalesForNF);
  const fnRequest = useServerFn(requestNF);
  const { data = [], isLoading } = useQuery({ queryKey: ["nf-eligible"], queryFn: () => fnList(), refetchInterval: 10_000, refetchOnWindowFocus: true });

  const [dialog, setDialog] = useState<{
    open: boolean;
    saleId: string | null;
    sale: { comprador?: string | null; empreendimento?: string | null; unidade?: string | null; corretor?: string | null; gerente?: string | null } | null;
    requesterRole: "corretor" | "gerente" | "diretor";
    observacao: string;
    distratoId: string;
    valorDesc: string;
    obsDesc: string;
  }>({ open: false, saleId: null, sale: null, requesterRole: "corretor", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" });
  const [search, setSearch] = useState("");

  const fnDistList = useServerFn(listDistratosForSale);
  const { data: distData, isLoading: loadingDist } = useQuery({
    queryKey: ["sale-distratos", dialog.saleId],
    queryFn: () => fnDistList({ data: { sale_id: dialog.saleId! } }),
    enabled: !!dialog.saleId && dialog.open,
  });
  const pendDistratos = (distData?.distratos ?? []).filter((d) => d.saldo_restante > 0.001);
  const historicoDistratos = distData?.distratos ?? [];
  const descontosTodos = distData?.descontos ?? [];
  const nfsDesconto = distData?.nfs_desconto ?? [];
  const selectedDist = pendDistratos.find((d) => d.id === dialog.distratoId) ?? null;
  const valorDescNum = Number((dialog.valorDesc || "").replace(",", "."));
  const maxDesc = selectedDist?.saldo_restante ?? 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((s) =>
      [s.comprador, s.empreendimento, s.unidade, s.corretor].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const reqMut = useMutation({
    mutationFn: (v: { sale_id: string; observacao?: string; distrato_id?: string; desconto_distrato?: number; observacao_distrato?: string }) => fnRequest({ data: v }),
    onSuccess: () => {
      toast.success("NF solicitada ao corretor.");
      qc.invalidateQueries({ queryKey: ["nf-eligible"] });
      qc.invalidateQueries({ queryKey: ["all-nfs"] });
      qc.invalidateQueries({ queryKey: ["distratos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-distrato"] });
      setDialog({ open: false, saleId: null, sale: null, requesterRole: "corretor", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="relative max-w-md mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar venda…" className="pl-9" />
      </div>
      <div className="glass-card p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Comprador</th>
              <th className="text-left p-3">Empreend. / Un.</th>
              <th className="text-left p-3">Corretor</th>
              <th className="text-right p-3">Comissão</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma venda elegível.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{fmtBR(s.data)}</td>
                <td className="p-3 font-medium">{s.comprador ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{s.empreendimento} / {s.unidade}</td>
                <td className="p-3">
                  <div>{s.corretor ?? "—"}</div>
                  {!s.mapped_user_id && <div className="text-xs text-destructive">Sem vínculo</div>}
                </td>
                <td className="p-3 text-right">{BRL(s.comissao_liq_corretor)}</td>
                <td className="p-3"><Badge variant="outline" className="text-xs">{s.status ?? "—"}</Badge></td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    <Button size="sm" disabled={!s.mapped_user_id || s.has_active_nf_corretor}
                      onClick={() => setDialog({ open: true, saleId: s.id, sale: s, requesterRole: "corretor", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" })}
                      style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                      title={s.has_active_nf_corretor ? "NF ativa do corretor" : "Solicitar NF ao corretor"}>
                      <FilePlus2 className="w-3.5 h-3.5 mr-1" />Corretor
                    </Button>
                    <Button size="sm" variant="outline" disabled={!s.gerente || s.has_active_nf_gerente}
                      onClick={() => setDialog({ open: true, saleId: s.id, sale: s, requesterRole: "gerente", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" })}
                      title={s.has_active_nf_gerente ? "NF ativa do gerente" : "Solicitar NF ao gerente"}>
                      <FilePlus2 className="w-3.5 h-3.5 mr-1" />Gerente
                    </Button>
                    <Button size="sm" variant="outline" disabled={s.has_active_nf_diretor}
                      onClick={() => setDialog({ open: true, saleId: s.id, sale: s, requesterRole: "diretor", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" })}
                      title={s.has_active_nf_diretor ? "NF ativa da gestão" : "Solicitar NF à gestão"}>
                      <FilePlus2 className="w-3.5 h-3.5 mr-1" />Gestão
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitar emissão de NF</DialogTitle>
            <DialogDescription>
              {dialog.sale && (
                <span>
                  <b>{dialog.sale.comprador}</b> · {dialog.sale.empreendimento} / {dialog.sale.unidade} · Corretor: <b>{dialog.sale.corretor}</b>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* ===== PAINEL DE DISTRATOS DO CORRETOR ===== */}
          {loadingDist ? (
            <div className="rounded-lg border border-border/60 p-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Verificando distratos…
            </div>
          ) : historicoDistratos.length > 0 ? (
            <div className="rounded-lg border-2 border-rose-500/40 bg-rose-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                <Ban className="w-4 h-4" />
                Este corretor possui {historicoDistratos.length} distrato{historicoDistratos.length > 1 ? "s" : ""} — desconto disponível
              </div>

              {/* Histórico completo */}
              <div className="space-y-2">
                {historicoDistratos.map((d) => {
                  const descsDest = descontosTodos.filter((x) => x.distrato_id === d.id && x.status === "aplicado");
                  const nfsDest = nfsDesconto.filter((x) => x.distrato_id === d.id);
                  return (
                    <div key={d.id} className="rounded-md border border-border/60 bg-background/40 p-3 text-xs space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{d.comprador ?? "—"}</div>
                          <div className="text-muted-foreground">{d.empreendimento} / {d.unidade}</div>
                          <div className="text-muted-foreground">Criado em {fmtBR(d.created_at)}</div>
                          {d.motivo && (
                            <div className="mt-1.5 p-2 rounded bg-muted/40 border border-border/40">
                              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Motivo</div>
                              <div className="text-sm whitespace-pre-wrap break-words">{d.motivo}</div>
                            </div>
                          )}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="text-[10px] uppercase text-muted-foreground">A devolver</div>
                          <div className="font-bold text-rose-300">{BRL(d.valor_devolver)}</div>
                          <div className="text-[10px] uppercase text-muted-foreground mt-1">Saldo</div>
                          <div className={`font-bold ${d.saldo_restante > 0 ? "text-amber-300" : "text-emerald-400"}`}>{BRL(d.saldo_restante)}</div>
                        </div>
                      </div>
                      {(descsDest.length > 0 || nfsDest.length > 0) && (
                        <div className="border-t border-border/40 pt-2 space-y-1">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Histórico de descontos aplicados</div>
                          {descsDest.map((dc) => (
                            <div key={dc.id} className="text-[11px] flex justify-between gap-2">
                              <span>Pedido · {fmtBR(dc.aplicado_at)}</span>
                              <span className="font-semibold text-rose-300">−{BRL(dc.valor_desconto)}</span>
                            </div>
                          ))}
                          {nfsDest.map((nf) => (
                            <div key={nf.id} className="text-[11px] flex justify-between gap-2">
                              <span>NF · {fmtBR(nf.created_at)} ({nf.status})</span>
                              <span className="font-semibold text-rose-300">−{BRL(nf.desconto_distrato)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Aplicar desconto agora */}
              {pendDistratos.length > 0 && (
                <div className="border-t-2 border-rose-500/30 pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Aplicar desconto nesta NF</Label>
                  <select
                    value={dialog.distratoId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const p = pendDistratos.find((x) => x.id === id);
                      setDialog({
                        ...dialog,
                        distratoId: id,
                        valorDesc: p ? p.saldo_restante.toFixed(2) : "",
                        obsDesc: p ? `Desconto referente ao distrato — ${p.comprador ?? "—"} · ${p.empreendimento ?? "—"} / ${p.unidade ?? "—"}` : "",
                      });
                    }}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— Nenhum (NF sem desconto) —</option>
                    {pendDistratos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.comprador} — saldo {BRL(p.saldo_restante)}
                      </option>
                    ))}
                  </select>
                  {selectedDist && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Valor do desconto (máx. {BRL(maxDesc)})</Label>
                        <Input
                          type="number" step="0.01" min="0" max={maxDesc}
                          value={dialog.valorDesc}
                          onChange={(e) => setDialog({ ...dialog, valorDesc: e.target.value })}
                          className="text-base font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Observação do desconto</Label>
                        <Textarea rows={2} value={dialog.obsDesc} onChange={(e) => setDialog({ ...dialog, obsDesc: e.target.value })} maxLength={2000} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Nenhum distrato vinculado a este corretor.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações para o corretor</Label>
            <Textarea value={dialog.observacao} onChange={(e) => setDialog({ ...dialog, observacao: e.target.value })} rows={3} maxLength={2000} placeholder="Instruções, prazo, dados de faturamento…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog({ open: false, saleId: null, sale: null, requesterRole: "corretor", observacao: "", distratoId: "", valorDesc: "", obsDesc: "" })}>Cancelar</Button>
            <Button disabled={reqMut.isPending || (!!selectedDist && (!(valorDescNum > 0) || valorDescNum > maxDesc + 0.001))}
              onClick={() => reqMut.mutate({
                sale_id: dialog.saleId!,
                observacao: dialog.observacao || undefined,
                distrato_id: selectedDist ? dialog.distratoId : undefined,
                desconto_distrato: selectedDist && valorDescNum > 0 ? valorDescNum : undefined,
                observacao_distrato: selectedDist ? (dialog.obsDesc || undefined) : undefined,
              })}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {reqMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =========== NFS ===========
function NFTab() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const fnList = useServerFn(listAllNFs);
  const fnConfirm = useServerFn(confirmNFReceived);
  const fnCancel = useServerFn(cancelNF);
  const fnDel = useServerFn(deleteNFRequest);
  const fnDownload = useServerFn(downloadNFFile);
  const fnPayNF = useServerFn(markNFPaid);
  const handleDownload = async (id: string, which: "1" | "2" = "1") => {
    try {
      const res = await fnDownload({ data: { id, which } }) as { base64: string; contentType: string; filename: string };
      const bin = atob(res.base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: res.contentType }));
      const a = document.createElement("a");
      a.href = url; a.download = res.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const [statusFilter, setStatusFilter] = useState<"solicitada" | "emitida" | "recebida" | "paga" | "cancelada" | "todos">("todos");
  const { data = [], isLoading } = useQuery({ queryKey: ["all-nfs"], queryFn: () => fnList(), refetchInterval: 10_000, refetchOnWindowFocus: true });
  const filtered = statusFilter === "todos" ? data : data.filter((n) => n.status === statusFilter);

  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; id: string | null; obs: string }>({ open: false, id: null, obs: "" });
  const [cancelDlg, setCancelDlg] = useState<{ open: boolean; id: string | null; motivo: string }>({ open: false, id: null, motivo: "" });

  const confirmMut = useMutation({
    mutationFn: (v: { id: string; observacao?: string }) => fnConfirm({ data: v }),
    onSuccess: () => { toast.success("Recebimento confirmado."); qc.invalidateQueries({ queryKey: ["all-nfs"] }); setConfirmDlg({ open: false, id: null, obs: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => fnCancel({ data: v }),
    onSuccess: () => { toast.success("NF cancelada."); qc.invalidateQueries({ queryKey: ["all-nfs"] }); setCancelDlg({ open: false, id: null, motivo: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => { toast.success("NF excluída."); qc.invalidateQueries({ queryKey: ["all-nfs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const payMut = useMutation({
    mutationFn: (id: string) => fnPayNF({ data: { id } }),
    onSuccess: () => { toast.success("NF marcada como paga."); qc.invalidateQueries({ queryKey: ["all-nfs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex gap-1 bg-secondary/40 p-1 rounded-lg w-fit mb-4">
        {(["solicitada", "emitida", "recebida", "paga", "cancelada", "todos"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-md capitalize transition ${statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="glass-card p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Solicitado</th>
              <th className="text-left p-3">Corretor</th>
              <th className="text-left p-3">Venda</th>
              <th className="text-left p-3">Nº NF</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Obs</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma NF.</td></tr>
            )}
            {filtered.map((n) => (
              <tr key={n.id} className="border-t border-border align-top">
                <td className="p-3 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3">
                  <div className="font-medium">{n.corretor_profile?.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{n.corretor_profile?.email}</div>
                </td>
                <td className="p-3">
                  <div className="font-medium">{n.sale?.comprador ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{n.sale?.empreendimento} / {n.sale?.unidade}</div>
                </td>
                <td className="p-3">
                  {n.numero_nf ? <span className="font-mono">{n.numero_nf}</span> : <span className="text-muted-foreground">—</span>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.arquivo_nf_url && (
                      <button
                        type="button"
                        onClick={() => handleDownload(n.id, "1")}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Download className="w-3 h-3" /> Nota fiscal
                      </button>
                    )}
                    {n.arquivo_nf_url_2 && (
                      <button
                        type="button"
                        onClick={() => handleDownload(n.id, "2")}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Download className="w-3 h-3" /> Promissória
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-3"><NFStatusBadge status={n.status} /></td>
                <td className="p-3 max-w-[280px] space-y-1.5">
                  {n.observacao_financeiro && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">💬 Financeiro</div>
                      <div className="text-xs whitespace-pre-wrap break-words text-foreground/90">{n.observacao_financeiro}</div>
                    </div>
                  )}
                  {n.observacao_corretor && (
                    <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-sky-300 font-semibold">💬 Corretor</div>
                      <div className="text-xs whitespace-pre-wrap break-words text-foreground/90">{n.observacao_corretor}</div>
                    </div>
                  )}
                  {n.observacao_recebimento && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-emerald-300 font-semibold">✓ Recebimento</div>
                      <div className="text-xs whitespace-pre-wrap break-words text-foreground/90">{n.observacao_recebimento}</div>
                    </div>
                  )}
                  {Number((n as { desconto_distrato?: number }).desconto_distrato) > 0 && (
                    <div className="rounded-md border-2 border-rose-500/40 bg-rose-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-rose-300 font-semibold">🏷 Desconto de distrato</div>
                      <div className="text-sm font-bold text-rose-300">−{BRL(Number((n as { desconto_distrato?: number }).desconto_distrato))}</div>
                      {(n as { observacao_distrato?: string | null }).observacao_distrato && (
                        <div className="text-xs whitespace-pre-wrap break-words text-foreground/80 mt-1">{(n as { observacao_distrato?: string | null }).observacao_distrato}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="flex gap-1.5 justify-end">
                    {n.status === "emitida" && (
                      <Button size="sm" onClick={() => setConfirmDlg({ open: true, id: n.id, obs: "" })}
                        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Confirmar
                      </Button>
                    )}
                    {n.status === "recebida" && (
                      <Button size="sm" disabled={payMut.isPending}
                        onClick={() => { if (confirm("Marcar esta NF como paga? Isso finaliza o processo.")) payMut.mutate(n.id); }}
                        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                        <Wallet className="w-3.5 h-3.5 mr-1" />Paga
                      </Button>
                    )}
                    {(n.status === "solicitada" || n.status === "emitida") && (
                      <Button size="sm" variant="outline" onClick={() => setCancelDlg({ open: true, id: n.id, motivo: "" })}>
                        Cancelar
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => { if (confirm("Excluir esta NF? (admin)")) delMut.mutate(n.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={confirmDlg.open} onOpenChange={(o) => setConfirmDlg({ ...confirmDlg, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar recebimento da NF</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>Observação</Label>
            <Textarea value={confirmDlg.obs} onChange={(e) => setConfirmDlg({ ...confirmDlg, obs: e.target.value })} rows={3} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDlg({ open: false, id: null, obs: "" })}>Cancelar</Button>
            <Button disabled={confirmMut.isPending}
              onClick={() => confirmMut.mutate({ id: confirmDlg.id!, observacao: confirmDlg.obs || undefined })}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDlg.open} onOpenChange={(o) => setCancelDlg({ ...cancelDlg, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar NF</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>Motivo *</Label>
            <Textarea value={cancelDlg.motivo} onChange={(e) => setCancelDlg({ ...cancelDlg, motivo: e.target.value })} rows={3} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDlg({ open: false, id: null, motivo: "" })}>Voltar</Button>
            <Button variant="destructive" disabled={!cancelDlg.motivo.trim() || cancelMut.isPending}
              onClick={() => cancelMut.mutate({ id: cancelDlg.id!, motivo: cancelDlg.motivo })}>
              {cancelMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancelar NF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; i: React.ReactNode }> = {
    pendente: { c: "bg-amber-500/10 text-amber-500 border-amber-500/30", i: <Clock className="w-3 h-3" /> },
    aprovado: { c: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", i: <CheckCircle2 className="w-3 h-3" /> },
    negado: { c: "bg-destructive/10 text-destructive border-destructive/30", i: <XCircle className="w-3 h-3" /> },
    pago: { c: "bg-primary/10 text-primary border-primary/30", i: <Wallet className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.pendente;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border capitalize ${s.c}`}>{s.i}{status}</span>;
}

function NFStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    solicitada: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    emitida: "bg-sky-500/10 text-sky-500 border-sky-500/30",
    recebida: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    paga: "bg-primary/10 text-primary border-primary/30",
    cancelada: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const label = status === "paga" ? "finalizada" : status;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border capitalize ${map[status] ?? ""}`}><Receipt className="w-3 h-3" />{label}</span>;
}

const SALE_STATUS_OPTIONS = ["RESERVADO", "ASSINADO", "CAIXA", "PAGO", "DISTRATO"] as const;
const SALE_STATUS_STYLES: Record<string, { text: string; border: string; bg: string; dot: string }> = {
  CAIXA:     { text: "text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
  PAGO:      { text: "text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
  ASSINADO:  { text: "text-amber-300",   border: "border-amber-400/40",   bg: "bg-amber-500/10",   dot: "bg-amber-400" },
  ASSINADA:  { text: "text-amber-300",   border: "border-amber-400/40",   bg: "bg-amber-500/10",   dot: "bg-amber-400" },
  RESERVADO: { text: "text-amber-300",   border: "border-amber-400/40",   bg: "bg-amber-500/10",   dot: "bg-amber-400" },
  DISTRATO:  { text: "text-rose-300",    border: "border-rose-400/40",    bg: "bg-rose-500/10",    dot: "bg-rose-400" },
};

function SaleStatusEditor({ saleId, status, canEdit }: { saleId: string | null; status: string | null; canEdit?: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(setSaleStatus);
  const [open, setOpen] = useState(false);
  const raw = (status ?? "").trim();
  const up = raw.toUpperCase();
  const s = SALE_STATUS_STYLES[up] ?? { text: "text-foreground", border: "border-border/60", bg: "bg-secondary/40", dot: "bg-muted-foreground" };

  const mut = useMutation({
    mutationFn: (next: typeof SALE_STATUS_OPTIONS[number]) =>
      fn({ data: { sale_id: saleId!, status: next } }),
    onSuccess: (res) => {
      toast.success("Status da venda atualizado.");
      if (res?.sheetWarning) toast.warning(`Planilha: ${res.sheetWarning}`);
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      qc.invalidateQueries({ queryKey: ["eligible-sales-nf"] });
      qc.invalidateQueries({ queryKey: ["all-nfs"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const badge = (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.text} ${s.border} ${s.bg} ${canEdit && saleId ? "cursor-pointer hover:brightness-125 transition" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shadow-[0_0_8px_currentColor]`} />
      {raw || "—"}
      {canEdit && saleId ? <span className="text-[9px] opacity-60 ml-0.5">▾</span> : null}
    </span>
  );

  if (!canEdit || !saleId) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Status venda</span>
        {badge}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Status venda</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" disabled={mut.isPending} className="inline-flex">
            {mut.isPending ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> atualizando…
              </span>
            ) : badge}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">Alterar status</div>
          <div className="flex flex-col gap-1">
            {SALE_STATUS_OPTIONS.map((opt) => {
              const cfg = SALE_STATUS_STYLES[opt];
              const active = opt === up;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={active || mut.isPending}
                  onClick={() => mut.mutate(opt)}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition ${active ? "bg-secondary/60 text-foreground cursor-default" : "hover:bg-secondary/40 text-foreground/90"}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {opt}
                  </span>
                  {active ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : null}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 px-1">Sincroniza com a planilha.</div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
