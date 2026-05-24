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
import { Receipt, Upload, Loader2, Download, CheckCircle2, Paperclip, X, Wallet } from "lucide-react";
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

export type MyNFItem = {
  id: string;
  status: string;
  numero_nf: string | null;
  valor_nf: number | null;
  drive_file_id: string | null;
  drive_file_id_2: string | null;
  created_at: string;
  sale_id: string;
  sale: {
    id: string;
    data: string | null;
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    valor_venda: number | null;
  } | null;
};

export function NFPill({ n }: { n: { status: string; numero_nf: string | null } }) {
  const label = n.status === "paga" ? "finalizado" : n.status;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${STATUS_STYLE[n.status] ?? ""}`}>
      <Receipt className="w-3 h-3" /> NF {n.numero_nf ? `#${n.numero_nf}` : ""} · {label}
    </div>
  );
}

export function useMyNFs() {
  const fnList = useServerFn(listMyNFs);
  return useQuery({
    queryKey: ["my-nfs"],
    queryFn: () => fnList() as unknown as Promise<MyNFItem[]>,
    refetchInterval: 30_000,
  });
}

export function nfsBySaleId(nfs: MyNFItem[]) {
  const map = new Map<string, MyNFItem[]>();
  for (const n of nfs) {
    if (!n.sale_id) continue;
    const arr = map.get(n.sale_id) ?? [];
    arr.push(n);
    map.set(n.sale_id, arr);
  }
  return map;
}

export function NFEmitDialog({
  nf, open, onOpenChange,
}: {
  nf: MyNFItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const fnEmit = useServerFn(markNFEmitted);
  const [form, setForm] = useState({ numero_nf: "", observacao: "", valor_nf: 0 });
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // reset when opens with a new NF
  useMemo(() => {
    if (open && nf) {
      setForm({ numero_nf: "", observacao: "", valor_nf: Number(nf.valor_nf) || 0 });
      setFile1(null);
      setFile2(null);
    }
  }, [open, nf]);

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
            id: nf!.id,
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
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["my-nfs"] });
      qc.invalidateQueries({ queryKey: ["gerente-overview"] });
      qc.invalidateQueries({ queryKey: ["diretor-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir Nota Fiscal</DialogTitle>
          <DialogDescription>
            {nf?.sale && (
              <>Venda: <b>{nf.sale.comprador}</b> · {nf.sale.empreendimento} / {nf.sale.unidade} · {fmtBR(nf.sale.data)}</>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
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
  );
}

/**
 * Per-sale-row cell rendering the NF pills + Enviar NF button + download/pago actions.
 * Mirrors the corretor's PEDIDOS/NF column structure.
 */
export function SaleNFCell({ saleId }: { saleId: string }) {
  const qc = useQueryClient();
  const fnPay = useServerFn(markNFPaid);
  const fnDownload = useServerFn(downloadNFFile);
  const { data: nfs = [] } = useMyNFs();
  const sNfs = useMemo(() => nfs.filter((n) => n.sale_id === saleId), [nfs, saleId]);
  const nfAberta = useMemo(() => sNfs.find((n) => n.status === "solicitada"), [sNfs]);
  const [emitOpen, setEmitOpen] = useState(false);
  const [activeNF, setActiveNF] = useState<MyNFItem | null>(null);

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
      a.href = url; a.download = r.filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error((e as Error).message); }
  };

  if (sNfs.length === 0) return null;

  return (
    <>
      <div className="space-y-1">
        {sNfs.map((n) => (
          <div key={n.id} className="flex items-center gap-1 flex-wrap">
            <NFPill n={n} />
            {n.drive_file_id && (
              <button
                title="Baixar NF"
                onClick={() => downloadFile(n.id, "1")}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Download className="w-3 h-3" />
              </button>
            )}
            {(n.status === "emitida" || n.status === "recebida") && (
              <button
                title="Marcar como paga"
                disabled={payMut.isPending}
                onClick={() => {
                  if (confirm("Confirmar que esta NF foi paga? Isso finaliza o processo.")) payMut.mutate(n.id);
                }}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
              >
                <Wallet className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {nfAberta && (
        <Button
          size="sm"
          className="mt-2"
          onClick={() => { setActiveNF(nfAberta); setEmitOpen(true); }}
          style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
        >
          <Upload className="w-3 h-3 mr-1" /> Enviar NF
        </Button>
      )}
      <NFEmitDialog nf={activeNF} open={emitOpen} onOpenChange={setEmitOpen} />
    </>
  );
}
