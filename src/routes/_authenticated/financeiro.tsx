import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listAllRequests, decideRequest, markRequestPaid, deleteCommissionRequest } from "@/lib/requests.functions";
import { listAllNFs, listEligibleSalesForNF, requestNF, confirmNFReceived, cancelNF, deleteNFRequest } from "@/lib/nf.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Wallet, Receipt, Clock, Search, FilePlus2, Trash2, Download } from "lucide-react";

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

      <Tabs defaultValue="adiantamentos">
        <TabsList>
          <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
          <TabsTrigger value="solicitar-nf">Solicitar NF</TabsTrigger>
          <TabsTrigger value="nfs">Notas Fiscais</TabsTrigger>
        </TabsList>
        <TabsContent value="adiantamentos" className="mt-4"><AdvancesTab /></TabsContent>
        <TabsContent value="solicitar-nf" className="mt-4"><RequestNFTab /></TabsContent>
        <TabsContent value="nfs" className="mt-4"><NFTab /></TabsContent>
      </Tabs>
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
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Corretor</th>
              <th className="text-left p-3">Venda</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-right p-3">Comissão Liq.</th>
              <th className="text-right p-3">Adiantado</th>
              <th className="text-right p-3">A Receber</th>
              <th className="text-right p-3">Solicitado</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Obs</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={12} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Nenhum pedido.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3">
                  <div className="font-medium">{r.corretor_profile?.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.corretor_profile?.email}</div>
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.sale?.comprador ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.sale?.empreendimento} / {r.sale?.unidade}</div>
                  <div className="text-xs text-muted-foreground">Venda: {BRL(r.sale?.valor_venda)} · Sinal: {BRL(r.valor_sinal)} · Bônus: {BRL(r.bonus_corretor)}</div>
                </td>
                <td className="p-3"><Badge variant="outline" className="text-xs">{r.tipo === "adiantamento" ? "Adiant." : "Comiss."}</Badge></td>
                <td className="p-3 text-right whitespace-nowrap font-medium">{BRL(r.comissao_liq)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <span className={r.adiantado_pago > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                    {BRL(r.adiantado_pago)}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <span className={r.a_receber > 0 ? "text-primary font-semibold" : "text-emerald-400 font-medium"}>
                    {BRL(r.a_receber)}
                  </span>
                </td>
                <td className="p-3 text-right font-semibold whitespace-nowrap">{BRL(r.valor_solicitado)}</td>
                <td className="p-3"><StatusBadge status={r.status} /></td>
                <td className="p-3 max-w-[220px]">
                  {r.observacao_corretor && <div className="text-xs"><b>C:</b> {r.observacao_corretor}</div>}
                  {r.observacao_financeiro && <div className="text-xs text-muted-foreground"><b>F:</b> {r.observacao_financeiro}</div>}
                  {r.motivo_negacao && <div className="text-xs text-destructive"><b>Motivo:</b> {r.motivo_negacao}</div>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
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
                  {r.status === "aprovado" && (
                    <Button size="sm" onClick={() => setObs({ open: true, id: r.id, action: "pagar", text: "" })}>
                      <Wallet className="w-3.5 h-3.5 mr-1" />Marcar pago
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="text-destructive ml-1"
                      onClick={() => { if (confirm("Excluir esta solicitação? (admin)")) delMut.mutate(r.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const [statusFilter, setStatusFilter] = useState<"solicitada" | "emitida" | "recebida" | "cancelada" | "todos">("emitida");
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
                    <a
                      href={n.arquivo_nf_url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Download className="w-3 h-3" /> Baixar
                    </a>
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
