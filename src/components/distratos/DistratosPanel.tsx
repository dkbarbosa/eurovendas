import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDistratos, markDistratoDevolvido, cancelDistrato, createDistrato, listSalesForDistrato, deleteDistrato } from "@/lib/distratos.functions";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Ban, CheckCircle2, Trash2, Search, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DistratosPanel() {
  const qc = useQueryClient();
  const { isAdmin, isFinanceiro } = useAuth();
  const isStaff = isAdmin || isFinanceiro;

  const fnList = useServerFn(listDistratos);
  const fnMark = useServerFn(markDistratoDevolvido);
  const fnCancel = useServerFn(cancelDistrato);
  const fnDelete = useServerFn(deleteDistrato);

  const [status, setStatus] = useState<"todos" | "pendente_devolucao" | "devolvido" | "cancelado">("todos");
  const [corretorFilter, setCorretorFilter] = useState<string>("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["distratos", status, corretorFilter, from, to],
    queryFn: () =>
      fnList({
        data: {
          status: status === "todos" ? undefined : status,
          corretor_user_id: corretorFilter === "todos" ? undefined : corretorFilter,
          from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
        },
      }),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.comprador, r.empreendimento, r.unidade, r.corretor_nome, r.corretor_profile?.display_name, r.corretor_profile?.email]
        .some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const corretores = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.corretor_user_id) {
        map.set(r.corretor_user_id, r.corretor_profile?.display_name ?? r.corretor_nome ?? r.corretor_profile?.email ?? "—");
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const totals = useMemo(() => {
    const sum = (pred: (r: typeof filtered[number]) => boolean) =>
      filtered.filter(pred).reduce((s, r) => s + (Number(r.valor_devolver) || 0), 0);
    return {
      qtdTotal: filtered.length,
      totalDevolver: sum(() => true),
      pendente: sum((r) => r.status === "pendente_devolucao"),
      devolvido: sum((r) => r.status === "devolvido"),
    };
  }, [filtered]);

  const [markDlg, setMarkDlg] = useState<{ open: boolean; id: string | null; text: string }>({ open: false, id: null, text: "" });

  const markMut = useMutation({
    mutationFn: (v: { id: string; observacao_recebimento?: string }) => fnMark({ data: v }),
    onSuccess: () => {
      toast.success("Devolução confirmada.");
      qc.invalidateQueries({ queryKey: ["distratos"] });
      setMarkDlg({ open: false, id: null, text: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => fnCancel({ data: { id } }),
    onSuccess: () => { toast.success("Distrato cancelado."); qc.invalidateQueries({ queryKey: ["distratos"] }); qc.invalidateQueries({ queryKey: ["all-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Header + ação */}
      {isStaff && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">Gestão de distratos — selecione qualquer venda para registrar.</div>
          <NewDistratoDialog onCreated={() => qc.invalidateQueries({ queryKey: ["distratos"] })} />
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Distratos" value={String(totals.qtdTotal)} sub="No recorte atual" />
        <KpiTile label="Total a devolver" value={BRL(totals.totalDevolver)} sub="Soma de todos" highlight />
        <KpiTile label="Pendentes" value={BRL(totals.pendente)} sub="Aguardando devolução" />
        <KpiTile label="Devolvido" value={BRL(totals.devolvido)} sub="Já recebido" success />
      </div>

      {/* Filtros */}
      {isStaff && (
        <div className="glass-card p-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente_devolucao">Pendente devolução</SelectItem>
                <SelectItem value="devolvido">Devolvido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Corretor</Label>
            <Select value={corretorFilter} onValueChange={setCorretorFilter}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os corretores</SelectItem>
                {corretores.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, empreendimento…" className="pl-9 h-9" />
            </div>
          </div>
          {(status !== "todos" || corretorFilter !== "todos" || from || to || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setStatus("todos"); setCorretorFilter("todos"); setFrom(""); setTo(""); setSearch(""); }}>
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="glass-card p-2 overflow-x-auto">
        {isLoading && <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum distrato registrado.</div>
        )}
        {!isLoading && filtered.length > 0 && (
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Empreend./Un.</th>
                {isStaff && <th className="text-left px-3 py-2">Corretor</th>}
                <th className="text-right px-3 py-2">Adiantamento</th>
                <th className="text-right px-3 py-2">Comissão final</th>
                <th className="text-right px-3 py-2">A devolver</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Motivo</th>
                {isStaff && <th className="px-3 py-2 w-1"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/40 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 font-medium">{r.comprador ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.empreendimento ?? "—"} / {r.unidade ?? "—"}</td>
                  {isStaff && (
                    <td className="px-3 py-2 text-xs">{r.corretor_profile?.display_name ?? r.corretor_nome ?? "—"}</td>
                  )}
                  <td className="px-3 py-2 text-right whitespace-nowrap text-xs">{BRL(r.valor_adiantamento)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-xs">{BRL(r.valor_comissao_final)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-destructive">{BRL(r.valor_devolver)}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 max-w-[260px]">
                    <div className="text-xs">{r.motivo}</div>
                    {r.observacao_financeiro && <div className="text-xs text-muted-foreground mt-1"><b>F:</b> {r.observacao_financeiro}</div>}
                    {r.observacao_recebimento && <div className="text-xs text-emerald-400 mt-1"><b>Recebido:</b> {r.observacao_recebimento}</div>}
                  </td>
                  {isStaff && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.status === "pendente_devolucao" && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => setMarkDlg({ open: true, id: r.id, text: "" })}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Marcar devolvido
                        </Button>
                      )}
                      {isAdmin && r.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive ml-1"
                          onClick={() => { if (confirm("Cancelar este distrato? Os pedidos voltarão para 'pago'.")) cancelMut.mutate(r.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mark devolvido */}
      <Dialog open={markDlg.open} onOpenChange={(o) => setMarkDlg({ ...markDlg, open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar devolução</DialogTitle>
            <DialogDescription>Registre observações sobre o recebimento do valor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea rows={3} value={markDlg.text} onChange={(e) => setMarkDlg({ ...markDlg, text: e.target.value })} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkDlg({ open: false, id: null, text: "" })}>Cancelar</Button>
            <Button disabled={markMut.isPending} onClick={() => markMut.mutate({ id: markDlg.id!, observacao_recebimento: markDlg.text || undefined })}>
              {markMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
    pendente_devolucao: { label: "Pendente devolução", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: <AlertTriangle className="w-3 h-3 mr-1" /> },
    devolvido: { label: "Devolvido", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border", icon: <Ban className="w-3 h-3 mr-1" /> },
  };
  const it = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={`text-[10px] ${it.cls}`}>{it.icon}{it.label}</Badge>;
}

function KpiTile({ label, value, sub, highlight, success }: { label: string; value: string; sub: string; highlight?: boolean; success?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-semibold tracking-tight mt-1 ${highlight ? "text-destructive" : success ? "text-emerald-400" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </motion.div>
  );
}

// ============== NOVO DISTRATO (financeiro) ==============
type SaleRow = {
  id: string;
  data: string | null;
  comprador: string | null;
  empreendimento: string | null;
  unidade: string | null;
  valor_venda: number | null;
  corretor: string | null;
  status: string | null;
  valor_adiantamento_pago: number;
  valor_comissao_final_pago: number;
  total_pago: number;
  ja_distratada: boolean;
};

function NewDistratoDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [valor, setValor] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  const fnList = useServerFn(listSalesForDistrato);
  const fnCreate = useServerFn(createDistrato);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-for-distrato"],
    queryFn: () => fnList(),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = sales as SaleRow[];
    if (!q) return rows.slice(0, 200);
    return rows
      .filter((s) =>
        [s.comprador, s.empreendimento, s.unidade, s.corretor, s.status]
          .some((v) => v?.toLowerCase().includes(q)),
      )
      .slice(0, 200);
  }, [sales, search]);

  const mut = useMutation({
    mutationFn: (v: { sale_id: string; valor_devolver: number; motivo: string; observacao_financeiro?: string }) =>
      fnCreate({ data: v }),
    onSuccess: () => {
      toast.success("Distrato registrado.");
      onCreated();
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setSelected(null);
    setValor("");
    setMotivo("");
    setObs("");
    setSearch("");
  };

  const valorNum = Number(valor.replace(",", "."));
  const canSubmit = !!selected && !selected.ja_distratada && motivo.trim().length >= 3 && valorNum >= 0 && !Number.isNaN(valorNum);

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Novo distrato
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Registrar distrato</DialogTitle>
            <DialogDescription>
              Selecione qualquer venda. O financeiro define o valor a ser devolvido à Euro.
            </DialogDescription>
          </DialogHeader>

          {!selected && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por cliente, empreendimento, corretor, status…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-border/40">
                {isLoading && <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
                {!isLoading && filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma venda encontrada.</div>
                )}
                {!isLoading && filtered.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/30 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Empreend./Un.</th>
                        <th className="text-left px-3 py-2">Corretor</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-right px-3 py-2">Pago</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-3 py-2 font-medium">{s.comprador ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{s.empreendimento ?? "—"} / {s.unidade ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">{s.corretor ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">
                            <Badge variant="outline" className="text-[10px]">{s.status ?? "—"}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{BRL(s.total_pago)}</td>
                          <td className="px-3 py-2 text-right">
                            {s.ja_distratada ? (
                              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">Já distratada</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => {
                                  setSelected(s);
                                  setValor(String(s.total_pago.toFixed(2)));
                                }}>
                                Selecionar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</div>
                    <div className="font-medium">{selected.comprador ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.empreendimento ?? "—"} / {selected.unidade ?? "—"} · Corretor: {selected.corretor ?? "—"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setValor(""); }}>
                    Trocar venda
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-destructive/20">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Adiantamento pago</div>
                    <div className="font-semibold">{BRL(selected.valor_adiantamento_pago)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Comissão final paga</div>
                    <div className="font-semibold">{BRL(selected.valor_comissao_final_pago)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Total já pago</div>
                    <div className="font-semibold text-destructive">{BRL(selected.total_pago)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Valor a devolver à Euro *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="text-lg font-semibold"
                />
                <div className="text-[11px] text-muted-foreground">
                  Sugestão: total já pago ({BRL(selected.total_pago)}). Você pode ajustar.
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Motivo do distrato *</Label>
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} placeholder="Descreva o motivo do distrato" />
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={2000} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
            {selected && (
              <Button
                variant="destructive"
                disabled={!canSubmit || mut.isPending}
                onClick={() => mut.mutate({
                  sale_id: selected.id,
                  valor_devolver: valorNum,
                  motivo,
                  observacao_financeiro: obs || undefined,
                })}
              >
                {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar distrato"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
