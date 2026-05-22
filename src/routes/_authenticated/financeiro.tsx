import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listAllRequests, decideRequest, markRequestPaid, deleteCommissionRequest } from "@/lib/requests.functions";
import { listAllNFs, listEligibleSalesForNF, requestNF, confirmNFReceived, cancelNF, deleteNFRequest, downloadNFFile } from "@/lib/nf.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CheckCircle2, XCircle, Wallet, Receipt, Clock, Search, FilePlus2, Trash2, Download, LayoutDashboard, TrendingUp, AlertTriangle, FileText, Hourglass, BadgeCheck } from "lucide-react";
import { motion } from "framer-motion";


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
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="adiantamentos" className="mt-4"><AdvancesTab /></TabsContent>
        <TabsContent value="solicitar-nf" className="mt-4"><RequestNFTab /></TabsContent>
        <TabsContent value="nfs" className="mt-4"><NFTab /></TabsContent>
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
  });
  const { data: nfs = [], isLoading: ln } = useQuery({
    queryKey: ["all-nfs"],
    queryFn: () => fnListNFs(),
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

  const [statusFilter, setStatusFilter] = useState<"pendente" | "aprovado" | "negado" | "pago" | "todos">("pendente");
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["all-requests", statusFilter],
    queryFn: () => fnList({ data: statusFilter === "todos" ? undefined : { status: statusFilter } }),
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

  const decideMut = useMutation({
    mutationFn: (v: { id: string; decision: "aprovado" | "negado"; motivo?: string; observacao?: string }) =>
      fnDecide({ data: v }),
    onSuccess: () => {
      toast.success("Decisão registrada.");
      qc.invalidateQueries({ queryKey: ["all-requests"] });
      setDeny({ open: false, id: null, motivo: "" });
      setObs({ open: false, id: null, action: "aprovar", text: "" });
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
                  <div key={key} className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
                    {/* Cabeçalho da venda */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 p-4 bg-secondary/40">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{head.sale?.comprador ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {head.sale?.empreendimento} / {head.sale?.unidade} · Venda {BRL(head.sale?.valor_venda)} · Sinal {BRL(Number(head.sale?.valor_sinal_negocio) || 0)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Corretor: <span className="text-foreground">{head.corretor_profile?.display_name ?? "—"}</span>
                          <span className="ml-1">({head.corretor_profile?.email})</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Comissão Liq.</div>
                          <div className="font-semibold">{BRL(comissaoLiq)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Adiantado</div>
                          <div className={`font-semibold ${adiantadoTot > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{BRL(adiantadoTot)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">Comissão Paga</div>
                          <div className="font-semibold">{BRL(finalPago)}</div>
                        </div>
                        <div className="text-right">
                          <div className="uppercase text-[10px] tracking-wider text-muted-foreground">A Receber</div>
                          {finalizado ? (
                            <div className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />100% pago
                            </div>
                          ) : (
                            <div className={`font-semibold ${aReceber > 0 ? "text-primary" : "text-muted-foreground"}`}>{BRL(aReceber)}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pedidos desta venda */}
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 w-24">Data</th>
                          <th className="text-left px-3 py-2 w-24">Tipo</th>
                          <th className="text-right px-3 py-2 w-32">Solicitado</th>
                          <th className="text-right px-3 py-2 w-44">Restante após</th>
                          <th className="text-left px-3 py-2 w-28">Status</th>
                          <th className="text-left px-3 py-2">Obs</th>
                          <th className="px-3 py-2 w-1"></th>
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
                                <Badge variant="outline" className="text-[10px]">
                                  {r.tipo === "adiantamento" ? "Adiant." : "Comiss."}
                                </Badge>
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
                                    <Badge variant="outline" className="text-[10px] bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30">
                                      Bônus: {BRL(r.bonus_corretor)}
                                    </Badge>
                                  )}
                                </div>
                                {r.observacao_corretor && <div className="text-xs"><b>C:</b> {r.observacao_corretor}</div>}
                                {r.observacao_financeiro && <div className="text-xs text-muted-foreground"><b>F:</b> {r.observacao_financeiro}</div>}
                                {r.motivo_negacao && <div className="text-xs text-destructive"><b>Motivo:</b> {r.motivo_negacao}</div>}
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
                                    <Button size="sm" variant="outline" onClick={() => setObs({ open: true, id: r.id, action: "pagar", text: "" })}>
                                      <Wallet className="w-3.5 h-3.5 mr-1" />Pago
                                    </Button>
                                  </div>
                                )}
                                {r.status === "aprovado" && (() => {
                                  const nfOk = r.nf_status === "recebida" || r.nf_status == null;
                                  if (!nfOk) {
                                    const label = r.nf_status === "emitida"
                                      ? "Aguardando recebimento da NF"
                                      : "Aguardando emissão da NF";
                                    return (
                                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                                        {label}
                                      </Badge>
                                    );
                                  }
                                  return (
                                    <Button size="sm" onClick={() => setObs({ open: true, id: r.id, action: "pagar", text: "" })}>
                                      <Wallet className="w-3.5 h-3.5 mr-1" />Marcar pago
                                    </Button>
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
      <Dialog open={obs.open} onOpenChange={(o) => setObs({ ...obs, open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{obs.action === "aprovar" ? "Aprovar pedido" : "Marcar como pago"}</DialogTitle>
            <DialogDescription>Observação opcional para o corretor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea value={obs.text} onChange={(e) => setObs({ ...obs, text: e.target.value })} rows={3} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setObs({ open: false, id: null, action: "aprovar", text: "" })}>Cancelar</Button>
            <Button disabled={decideMut.isPending || payMut.isPending}
              onClick={() => obs.action === "aprovar"
                ? decideMut.mutate({ id: obs.id!, decision: "aprovado", observacao: obs.text || undefined })
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
  const { data = [], isLoading } = useQuery({ queryKey: ["nf-eligible"], queryFn: () => fnList() });

  const [dialog, setDialog] = useState<{ open: boolean; saleId: string | null; observacao: string }>({ open: false, saleId: null, observacao: "" });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((s) =>
      [s.comprador, s.empreendimento, s.unidade, s.corretor].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const reqMut = useMutation({
    mutationFn: (v: { sale_id: string; observacao?: string }) => fnRequest({ data: v }),
    onSuccess: () => {
      toast.success("NF solicitada ao corretor.");
      qc.invalidateQueries({ queryKey: ["nf-eligible"] });
      qc.invalidateQueries({ queryKey: ["all-nfs"] });
      setDialog({ open: false, saleId: null, observacao: "" });
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
                  <Button size="sm" disabled={!s.mapped_user_id}
                    onClick={() => setDialog({ open: true, saleId: s.id, observacao: "" })}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                    <FilePlus2 className="w-3.5 h-3.5 mr-1" />Solicitar NF
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar emissão de NF</DialogTitle><DialogDescription>O corretor será notificado.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={dialog.observacao} onChange={(e) => setDialog({ ...dialog, observacao: e.target.value })} rows={3} maxLength={2000} placeholder="Instruções, prazo, dados de faturamento…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog({ open: false, saleId: null, observacao: "" })}>Cancelar</Button>
            <Button disabled={reqMut.isPending}
              onClick={() => reqMut.mutate({ sale_id: dialog.saleId!, observacao: dialog.observacao || undefined })}
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
  const handleDownload = async (id: string) => {
    try {
      const res = await fnDownload({ data: { id } }) as { base64: string; contentType: string; filename: string };
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

  const [statusFilter, setStatusFilter] = useState<"solicitada" | "emitida" | "recebida" | "cancelada" | "todos">("todos");
  const { data = [], isLoading } = useQuery({ queryKey: ["all-nfs"], queryFn: () => fnList() });
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

  return (
    <>
      <div className="flex gap-1 bg-secondary/40 p-1 rounded-lg w-fit mb-4">
        {(["solicitada", "emitida", "recebida", "cancelada", "todos"] as const).map((s) => (
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
                  {n.arquivo_nf_url && (
                    <button
                      type="button"
                      onClick={() => handleDownload(n.id)}
                      className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Download className="w-3 h-3" /> Baixar
                    </button>
                  )}
                </td>
                <td className="p-3"><NFStatusBadge status={n.status} /></td>
                <td className="p-3 max-w-[220px]">
                  {n.observacao_financeiro && <div className="text-xs"><b>F:</b> {n.observacao_financeiro}</div>}
                  {n.observacao_corretor && <div className="text-xs text-muted-foreground"><b>C:</b> {n.observacao_corretor}</div>}
                  {n.observacao_recebimento && <div className="text-xs text-emerald-500"><b>Receb:</b> {n.observacao_recebimento}</div>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="flex gap-1.5 justify-end">
                    {n.status === "emitida" && (
                      <Button size="sm" onClick={() => setConfirmDlg({ open: true, id: n.id, obs: "" })}
                        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Confirmar
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
    cancelada: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border capitalize ${map[status] ?? ""}`}><Receipt className="w-3 h-3" />{status}</span>;
}
