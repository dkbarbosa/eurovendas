import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyNFs, markNFEmitted, markNFPaid, downloadNFFile } from "@/lib/nf.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, Upload, Loader2, Download, CheckCircle2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_STYLE: Record<string, string> = {
  solicitada: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  emitida: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  recebida: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  paga: "bg-primary/10 text-primary border-primary/30",
  cancelada: "bg-destructive/10 text-destructive border-destructive/30",
};

type NFItem = {
  id: string;
  status: string;
  numero_nf: string | null;
  valor_nf: number | null;
  observacao_financeiro: string | null;
  observacao_corretor: string | null;
  observacao_recebimento: string | null;
  drive_file_id: string | null;
  drive_file_id_2: string | null;
  created_at: string;
  emitida_at: string | null;
  recebida_at: string | null;
  paga_at: string | null;
  desconto_distrato: number | null;
  sale: {
    id: string;
    data: string | null;
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    valor_venda: number | null;
  } | null;
};

export function MinhasNFsSection({ title = "Minhas Notas Fiscais" }: { title?: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listMyNFs);
  const fnEmit = useServerFn(markNFEmitted);
  const fnPay = useServerFn(markNFPaid);
  const fnDownload = useServerFn(downloadNFFile);

  const { data: nfs = [], isLoading } = useQuery({
    queryKey: ["my-nfs"],
    queryFn: () => fnList() as unknown as Promise<NFItem[]>,
  });

  const pendentes = useMemo(() => nfs.filter((n) => n.status === "solicitada"), [nfs]);

  // ---- Dialog upload
  const [dlg, setDlg] = useState<{ open: boolean; nf: NFItem | null }>({ open: false, nf: null });
  const [form, setForm] = useState({ numero_nf: "", observacao: "", valor_nf: 0 });
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const openEmit = (nf: NFItem) => {
    setForm({ numero_nf: "", observacao: "", valor_nf: Number(nf.valor_nf) || 0 });
    setFile1(null);
    setFile2(null);
    setDlg({ open: true, nf });
  };

  const readB64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Falha ao ler arquivo"));
    r.readAsDataURL(f);
  });

  const emitMut = useMutation({
    mutationFn: async () => {
      if (!file1) throw new Error("Anexe o arquivo da NF.");
      if (file1.size > 15 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. 15 MB).");
      if (file2 && file2.size > 15 * 1024 * 1024) throw new Error("2º arquivo muito grande (máx. 15 MB).");
      setUploading(true);
      try {
        const b1 = await readB64(file1);
        const f2 = file2 ? {
          file_base64: await readB64(file2),
          file_name: file2.name,
          file_mime: file2.type || "application/octet-stream",
        } : undefined;
        return fnEmit({
          data: {
            id: dlg.nf!.id,
            numero_nf: form.numero_nf.trim(),
            valor_nf: form.valor_nf,
            file_base64: b1,
            file_name: file1.name,
            file_mime: file1.type || "application/octet-stream",
            observacao: form.observacao || undefined,
            file2: f2,
          },
        });
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success("NF enviada com sucesso.");
      setDlg({ open: false, nf: null });
      qc.invalidateQueries({ queryKey: ["my-nfs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payMut = useMutation({
    mutationFn: (id: string) => fnPay({ data: { id } }),
    onSuccess: () => {
      toast.success("NF marcada como paga.");
      qc.invalidateQueries({ queryKey: ["my-nfs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadFile = async (id: string, which: "1" | "2") => {
    try {
      const r = await fnDownload({ data: { id, which } }) as { base64: string; contentType: string; filename: string };
      const bin = atob(r.base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const blob = new Blob([buf], { type: r.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" /> {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Quando o financeiro solicitar uma NF, ela aparecerá aqui para emissão.
          </p>
        </div>
        {pendentes.length > 0 && (
          <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-medium">
            {pendentes.length} NF{pendentes.length > 1 ? "s" : ""} aguardando emissão
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…</div>
      ) : nfs.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma nota fiscal solicitada.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Venda</th>
                <th className="text-left p-3">Solicitado em</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {nfs.map((n) => {
                const sale = n.sale;
                const desconto = Number(n.desconto_distrato) || 0;
                return (
                  <tr key={n.id} className="border-t border-border/40">
                    <td className="p-3 align-top">
                      <div className="font-medium">{sale?.comprador ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {sale?.empreendimento} {sale?.unidade ? `/ ${sale.unidade}` : ""} · {fmtBR(sale?.data)}
                      </div>
                      {n.observacao_financeiro && (
                        <div className="mt-1 text-[11px] text-muted-foreground italic">
                          Financeiro: {n.observacao_financeiro}
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top text-xs text-muted-foreground">{fmtBR(n.created_at)}</td>
                    <td className="p-3 align-top text-right tabular-nums">
                      {n.valor_nf ? BRL(Number(n.valor_nf)) : "—"}
                      {desconto > 0 && (
                        <div className="text-[10px] text-violet-300">desconto: {BRL(desconto)}</div>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${STATUS_STYLE[n.status] ?? ""}`}>
                        <Receipt className="w-3 h-3" /> {n.numero_nf ? `#${n.numero_nf}` : ""} {n.status === "paga" ? "finalizado" : n.status}
                      </span>
                    </td>
                    <td className="p-3 align-top text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {n.status === "solicitada" && (
                          <Button size="sm" onClick={() => openEmit(n)} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                            <Upload className="w-3.5 h-3.5 mr-1" /> Emitir NF
                          </Button>
                        )}
                        {n.drive_file_id && (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(n.id, "1")}>
                            <Download className="w-3.5 h-3.5 mr-1" /> NF
                          </Button>
                        )}
                        {n.drive_file_id_2 && (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(n.id, "2")}>
                            <Download className="w-3.5 h-3.5 mr-1" /> 2º Arq
                          </Button>
                        )}
                        {(n.status === "emitida" || n.status === "recebida") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payMut.isPending}
                            onClick={() => {
                              if (confirm("Confirmar que esta NF foi paga? Esta ação finaliza o processo.")) payMut.mutate(n.id);
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Marcar paga
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
      )}

      {/* Dialog emit */}
      <Dialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, nf: o ? dlg.nf : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Nota Fiscal</DialogTitle>
            <DialogDescription>
              {dlg.nf?.sale && (
                <>Venda: <b>{dlg.nf.sale.comprador}</b> · {dlg.nf.sale.empreendimento} / {dlg.nf.sale.unidade} · {fmtBR(dlg.nf.sale.data)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Número da NF *</Label>
                <Input value={form.numero_nf} onChange={(e) => setForm({ ...form, numero_nf: e.target.value })} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor da NF (R$) *</Label>
                <CurrencyInput value={form.valor_nf} onValueChange={(v) => setForm({ ...form, valor_nf: v ?? 0 })} />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Anexos</span>
                <span className="text-[11px] text-muted-foreground">{(file1 ? 1 : 0) + (file2 ? 1 : 0)}/2 · máx 15MB</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "nf", file: file1, setFile: setFile1, label: "Nota Fiscal", required: true },
                  { key: "pr", file: file2, setFile: setFile2, label: "Anexo extra", required: false },
                ] as const).map((slot) => {
                  const has = !!slot.file;
                  return (
                    <label
                      key={slot.key}
                      className={`group relative cursor-pointer rounded-md border px-3 py-2.5 transition-all flex items-center gap-2.5 ${
                        has
                          ? "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/15"
                          : slot.required
                            ? "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60"
                            : "border-border/60 bg-background/40 hover:bg-background/70"
                      }`}
                    >
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.xml,application/pdf,text/xml,application/xml,image/*"
                        onChange={(e) => slot.setFile(e.target.files?.[0] ?? null)}
                      />
                      <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${has ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary/60 text-muted-foreground"}`}>
                        {has ? <CheckCircle2 className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium flex items-center gap-1">
                          {slot.label}
                          {slot.required && <span className="text-primary">*</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {has ? `${slot.file!.name} · ${(slot.file!.size / 1024).toFixed(0)} KB` : "Clique para anexar"}
                        </div>
                      </div>
                      {has && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); slot.setFile(null); }}
                          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Remover"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={3}
                maxLength={2000}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg({ open: false, nf: null })}>Cancelar</Button>
            <Button
              disabled={emitMut.isPending || uploading || !form.numero_nf.trim() || !file1 || form.valor_nf <= 0}
              onClick={() => emitMut.mutate()}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              {emitMut.isPending || uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar NF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
