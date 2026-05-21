import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listMyBrokerSales, listDistinctCorretores } from "@/lib/commissions.functions";
import { createCommissionRequest } from "@/lib/requests.functions";
import { markNFEmitted } from "@/lib/nf.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Wallet, TrendingUp, FileText, Receipt, CheckCircle2, Clock, XCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: ComissoesPage,
  head: () => ({ meta: [{ title: "Comissões · Gestão Comercial" }] }),
});

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ComissoesPage() {
  const { isStaff, corretorNome: myName } = useAuth();
  const qc = useQueryClient();

  const fnSales = useServerFn(listMyBrokerSales);
  const fnDistinct = useServerFn(listDistinctCorretores);
  const fnCreate = useServerFn(createCommissionRequest);
  const fnEmit = useServerFn(markNFEmitted);

  const [staffSelectedBroker, setStaffSelectedBroker] = useState<string | undefined>(undefined);
  const activeBrokerArg = isStaff ? staffSelectedBroker : undefined;

  const { data: brokers = [] } = useQuery({
    queryKey: ["distinct-corretores"],
    queryFn: () => fnDistinct(),
    enabled: isStaff,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-broker-sales", activeBrokerArg ?? myName],
    queryFn: () => fnSales({ data: activeBrokerArg ? { corretorNome: activeBrokerArg } : undefined }),
  });

  const sales = data?.sales ?? [];
  const requests = data?.requests ?? [];
  const nfs = data?.nfs ?? [];
  const displayName = data?.corretorNome ?? null;

  const kpis = useMemo(() => {
    const total = sales.reduce((s, x) => s + (Number(x.comissao_liq_corretor) || 0), 0);
    const pagas = sales.filter((s) => (s.status ?? "").toLowerCase().includes("pag")).reduce(
      (s, x) => s + (Number(x.comissao_liq_corretor) || 0),
      0,
    );
    const aReceber = total - pagas;
    const pendReq = requests.filter((r) => r.status === "pendente").length;
    return { total, pagas, aReceber, pendReq, count: sales.length };
  }, [sales, requests]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; vendas: number; comissao: number }>();
    for (const s of sales) {
      if (!s.data) continue;
      const k = String(s.data).slice(0, 7);
      const cur = map.get(k) ?? { mes: k, vendas: 0, comissao: 0 };
      cur.vendas += 1;
      cur.comissao += Number(s.comissao_liq_corretor) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [sales]);

  const requestsBySale = useMemo(() => {
    const m = new Map<string, typeof requests>();
    for (const r of requests) {
      const arr = m.get(r.sale_id) ?? [];
      arr.push(r);
      m.set(r.sale_id, arr);
    }
    return m;
  }, [requests]);

  const nfsBySale = useMemo(() => {
    const m = new Map<string, typeof nfs>();
    for (const n of nfs) {
      const arr = m.get(n.sale_id) ?? [];
      arr.push(n);
      m.set(n.sale_id, arr);
    }
    return m;
  }, [nfs]);

  // ---- Diálogo de pedido
  const [reqDialog, setReqDialog] = useState<{ open: boolean; sale: (typeof sales)[number] | null }>({
    open: false,
    sale: null,
  });
  const [reqForm, setReqForm] = useState({
    tipo: "adiantamento" as "adiantamento" | "comissao_final",
    valor_sinal: "",
    bonus_corretor: "",
    valor_solicitado: "",
    observacao: "",
  });
  const openReq = (sale: (typeof sales)[number]) => {
    setReqForm({
      tipo: "adiantamento",
      valor_sinal: "",
      bonus_corretor: "",
      valor_solicitado: "",
      observacao: "",
    });
    setReqDialog({ open: true, sale });
  };
  const createMut = useMutation({
    mutationFn: () =>
      fnCreate({
        data: {
          sale_id: reqDialog.sale!.id,
          tipo: reqForm.tipo,
          valor_sinal: Number(reqForm.valor_sinal.replace(",", ".")) || 0,
          bonus_corretor: Number(reqForm.bonus_corretor.replace(",", ".")) || 0,
          valor_solicitado: Number(reqForm.valor_solicitado.replace(",", ".")) || 0,
          observacao_corretor: reqForm.observacao || undefined,
          act_as_corretor: isStaff ? activeBrokerArg : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isStaff ? "Pedido de teste criado." : "Solicitação enviada ao financeiro.");
      setReqDialog({ open: false, sale: null });
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Diálogo NF
  const [nfDialog, setNfDialog] = useState<{ open: boolean; nfId: string | null }>({ open: false, nfId: null });
  const [nfForm, setNfForm] = useState({ numero_nf: "", arquivo_url: "", observacao: "" });
  const openNF = (nfId: string) => {
    setNfForm({ numero_nf: "", arquivo_url: "", observacao: "" });
    setNfDialog({ open: true, nfId });
  };
  const emitMut = useMutation({
    mutationFn: () =>
      fnEmit({
        data: {
          id: nfDialog.nfId!,
          numero_nf: nfForm.numero_nf.trim(),
          arquivo_url: nfForm.arquivo_url.trim() || undefined,
          observacao: nfForm.observacao || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("NF marcada como emitida.");
      setNfDialog({ open: false, nfId: null });
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Painel do Corretor</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Comissões</h1>
          {displayName && (
            <p className="text-sm text-muted-foreground mt-1">
              Visualizando: <span className="text-foreground font-medium">{displayName}</span>
            </p>
          )}
        </div>
        {isStaff && (
          <div className="w-full md:w-72">
            <Label className="text-xs">Ver como corretor</Label>
            <Select value={staffSelectedBroker ?? ""} onValueChange={(v) => setStaffSelectedBroker(v || undefined)}>
              <SelectTrigger><SelectValue placeholder="Selecione um corretor" /></SelectTrigger>
              <SelectContent>
                {brokers.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!displayName && !isLoading && (
        <div className="glass-card p-6 text-sm text-muted-foreground">
          {isStaff
            ? "Selecione um corretor acima."
            : "Sua conta ainda não está vinculada a um corretor na planilha. Solicite ao administrador o vínculo em Administração → Usuários."}
        </div>
      )}

      {displayName && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Comissão Total" value={BRL(kpis.total)} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Já Pago" value={BRL(kpis.pagas)} />
            <Kpi icon={<Clock className="w-4 h-4" />} label="A Receber" value={BRL(kpis.aReceber)} accent />
            <Kpi icon={<Wallet className="w-4 h-4" />} label="Vendas / Pedidos" value={`${kpis.count} / ${kpis.pendReq}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Comissão por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => BRL(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="comissao" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="glass-card p-5">
              <h3 className="font-display text-lg mb-3">Vendas por mês</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="vendas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="glass-card p-2 overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Comprador</th>
                  <th className="text-left p-3">Empreend. / Un.</th>
                  <th className="text-right p-3">Venda</th>
                  <th className="text-right p-3">Comissão Liq.</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Pedidos / NF</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  </td></tr>
                )}
                {!isLoading && sales.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhuma venda encontrada.</td></tr>
                )}
                {sales.map((s) => {
                  const reqs = requestsBySale.get(s.id) ?? [];
                  const sNfs = nfsBySale.get(s.id) ?? [];
                  const hasPending = reqs.some((r) => r.status === "pendente");
                  const nfSolicitada = sNfs.find((n) => n.status === "solicitada");
                  return (
                    <tr key={s.id} className="border-t border-border align-top">
                      <td className="p-3 whitespace-nowrap">{s.data ?? "—"}</td>
                      <td className="p-3 font-medium">{s.comprador ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        <div>{s.empreendimento ?? "—"}</div>
                        <div className="text-xs">Unid: {s.unidade ?? "—"}</div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">{BRL(s.valor_venda)}</td>
                      <td className="p-3 text-right whitespace-nowrap font-medium">{BRL(s.comissao_liq_corretor)}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{s.status ?? "—"}</Badge></td>
                      <td className="p-3">
                        <div className="space-y-1">
                          {reqs.map((r) => <RequestPill key={r.id} r={r} />)}
                          {sNfs.map((n) => <NFPill key={n.id} n={n} />)}
                          {reqs.length === 0 && sNfs.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="outline" disabled={hasPending} onClick={() => openReq(s)}>
                            {hasPending ? "Pendente" : isStaff ? "Solicitar (teste)" : "Solicitar"}
                          </Button>
                          {nfSolicitada && (
                            <Button size="sm" onClick={() => openNF(nfSolicitada.id)}
                              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                              {isStaff ? "Emitir NF (teste)" : "Emitir NF"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* DIALOG: Solicitar */}
      <Dialog open={reqDialog.open} onOpenChange={(o) => setReqDialog({ open: o, sale: o ? reqDialog.sale : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar adiantamento / comissão</DialogTitle>
            <DialogDescription>
              {reqDialog.sale && (
                <>Venda: <b>{reqDialog.sale.comprador}</b> · {reqDialog.sale.empreendimento} / {reqDialog.sale.unidade}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={reqForm.tipo} onValueChange={(v) => setReqForm({ ...reqForm, tipo: v as typeof reqForm.tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="comissao_final">Comissão final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor solicitado (R$)</Label>
                <Input inputMode="decimal" value={reqForm.valor_solicitado} onChange={(e) => setReqForm({ ...reqForm, valor_solicitado: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Sinal recebido (R$)</Label>
                <Input inputMode="decimal" value={reqForm.valor_sinal} onChange={(e) => setReqForm({ ...reqForm, valor_sinal: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Bônus corretor (R$)</Label>
                <Input inputMode="decimal" value={reqForm.bonus_corretor} onChange={(e) => setReqForm({ ...reqForm, bonus_corretor: e.target.value })} placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={reqForm.observacao} onChange={(e) => setReqForm({ ...reqForm, observacao: e.target.value })} rows={3} maxLength={2000} placeholder="Detalhes para o financeiro…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReqDialog({ open: false, sale: null })}>Cancelar</Button>
            <Button disabled={createMut.isPending || !reqForm.valor_solicitado} onClick={() => createMut.mutate()}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Emitir NF */}
      <Dialog open={nfDialog.open} onOpenChange={(o) => setNfDialog({ open: o, nfId: o ? nfDialog.nfId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Nota Fiscal</DialogTitle>
            <DialogDescription>Informe o número da NF emitida.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Número da NF *</Label>
              <Input value={nfForm.numero_nf} onChange={(e) => setNfForm({ ...nfForm, numero_nf: e.target.value })} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>URL do arquivo (opcional)</Label>
              <Input value={nfForm.arquivo_url} onChange={(e) => setNfForm({ ...nfForm, arquivo_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={nfForm.observacao} onChange={(e) => setNfForm({ ...nfForm, observacao: e.target.value })} rows={3} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNfDialog({ open: false, nfId: null })}>Cancelar</Button>
            <Button disabled={emitMut.isPending || !nfForm.numero_nf.trim()} onClick={() => emitMut.mutate()}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {emitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar emissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
      <div className={`mt-2 font-display text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function RequestPill({ r }: { r: { id: string; tipo: string; valor_solicitado: number; status: string; motivo_negacao: string | null } }) {
  const map: Record<string, { c: string; i: React.ReactNode; l: string }> = {
    pendente: { c: "bg-amber-500/10 text-amber-500 border-amber-500/30", i: <Clock className="w-3 h-3" />, l: "Pendente" },
    aprovado: { c: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", i: <CheckCircle2 className="w-3 h-3" />, l: "Aprovado" },
    negado: { c: "bg-destructive/10 text-destructive border-destructive/30", i: <XCircle className="w-3 h-3" />, l: "Negado" },
    pago: { c: "bg-primary/10 text-primary border-primary/30", i: <Wallet className="w-3 h-3" />, l: "Pago" },
  };
  const s = map[r.status] ?? map.pendente;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${s.c}`} title={r.motivo_negacao ?? undefined}>
      {s.i}<FileText className="w-3 h-3" /> {r.tipo === "adiantamento" ? "Adiant." : "Comiss."}: {BRL(r.valor_solicitado)} · {s.l}
    </div>
  );
}

function NFPill({ n }: { n: { id: string; status: string; numero_nf: string | null } }) {
  const map: Record<string, string> = {
    solicitada: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    emitida: "bg-sky-500/10 text-sky-500 border-sky-500/30",
    recebida: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    cancelada: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${map[n.status] ?? ""}`}>
      <Receipt className="w-3 h-3" /> NF {n.numero_nf ? `#${n.numero_nf}` : ""} · {n.status}
    </div>
  );
}
