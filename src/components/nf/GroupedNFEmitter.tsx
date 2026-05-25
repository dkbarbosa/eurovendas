import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { markNFsEmittedBatch } from "@/lib/nf.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, Upload, Loader2, CheckCircle2, Paperclip, X, Layers } from "lucide-react";
import { toast } from "sonner";

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

export type PendingNFItem = {
  id: string;
  valor_nf: number | null;
  sale_id: string;
  desconto_distrato?: number | null;
  observacao_distrato?: string | null;
  sale: {
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    data: string | null;
  } | null;
};


export function GroupedNFEmitter({
  items,
  role,
  invalidateKeys = [],
}: {
  items: PendingNFItem[];
  role: "corretor" | "gerente" | "diretor";
  invalidateKeys?: string[][];
}) {
  const qc = useQueryClient();
  const fnBatch = useServerFn(markNFsEmittedBatch);

  // Agrupa por empreendimento (normalizado)
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: PendingNFItem[] }>();
    for (const n of items) {
      const emp = (n.sale?.empreendimento ?? "Sem empreendimento").trim();
      const key = emp.toLowerCase();
      const g = m.get(key) ?? { label: emp, items: [] };
      g.items.push(n);
      m.set(key, g);
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [items]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dlgGroupKey, setDlgGroupKey] = useState<string | null>(null);
  const [form, setForm] = useState({ numero_nf: "", observacao: "" });
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const readB64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(r.error ?? new Error("Falha ao ler arquivo"));
      r.readAsDataURL(f);
    });

  const dlgGroup = useMemo(
    () => groups.find((g) => g.label.toLowerCase() === dlgGroupKey) ?? null,
    [groups, dlgGroupKey],
  );
  const dlgSelectedItems = useMemo(
    () => (dlgGroup ? dlgGroup.items.filter((n) => selected[n.id]) : []),
    [dlgGroup, selected],
  );
  const dlgTotal = useMemo(
    () => dlgSelectedItems.reduce((s, n) => s + (Number(n.valor_nf) || 0), 0),
    [dlgSelectedItems],
  );

  const emitMut = useMutation({
    mutationFn: async () => {
      if (!dlgSelectedItems.length) throw new Error("Selecione ao menos 1 adiantamento.");
      if (!file1) throw new Error("Anexe o arquivo da NF.");
      if (file1.size > 15 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. 15 MB).");
      if (file2 && file2.size > 15 * 1024 * 1024) throw new Error("2º arquivo muito grande (máx. 15 MB).");
      setUploading(true);
      try {
        const b1 = await readB64(file1);
        const f2 = file2
          ? { file_base64: await readB64(file2), file_name: file2.name, file_mime: file2.type || "application/octet-stream" }
          : undefined;
        return fnBatch({
          data: {
            ids: dlgSelectedItems.map((n) => n.id),
            numero_nf: form.numero_nf.trim(),
            valor_nf_total: dlgTotal,
            observacao: form.observacao || undefined,
            file_base64: b1,
            file_name: file1.name,
            file_mime: file1.type || "application/octet-stream",
            file2: f2,
          },
        });
      } finally {
        setUploading(false);
      }
    },
    onSuccess: (r: { count: number }) => {
      toast.success(`1 NF emitida para ${r.count} adiantamento(s).`);
      setDlgGroupKey(null);
      setSelected({});
      setForm({ numero_nf: "", observacao: "" });
      setFile1(null);
      setFile2(null);
      qc.invalidateQueries({ queryKey: ["my-nfs"] });
      qc.invalidateQueries({ queryKey: ["my-broker-sales"] });
      qc.invalidateQueries({ queryKey: ["gerente-overview"] });
      qc.invalidateQueries({ queryKey: ["diretor-overview"] });
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) return null;

  return (
    <section className="glass-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-display text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Emitir 1 NF para vários adiantamentos
          </h3>
          <p className="text-xs text-muted-foreground">
            Junte adiantamentos aprovados do mesmo empreendimento e envie uma única nota fiscal.
          </p>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500">
          {items.length} aguardando emissão
        </span>
      </header>

      <div className="space-y-3">
        {groups.map((g) => {
          const groupKey = g.label.toLowerCase();
          const checkedCount = g.items.filter((n) => selected[n.id]).length;
          const total = g.items
            .filter((n) => selected[n.id])
            .reduce((s, n) => s + (Number(n.valor_nf) || 0), 0);
          const allChecked = checkedCount === g.items.length && g.items.length > 0;
          const toggleAll = () => {
            const next = { ...selected };
            const newVal = !allChecked;
            for (const n of g.items) next[n.id] = newVal;
            setSelected(next);
          };
          return (
            <div key={groupKey} className="rounded-lg border border-border/60 p-3 bg-background/30">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} id={`all-${groupKey}`} />
                  <Label htmlFor={`all-${groupKey}`} className="font-medium cursor-pointer">
                    {g.label}
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    · {g.items.length} adiantamento{g.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Selecionado: <b className="text-foreground">{BRL(total)}</b> ({checkedCount})
                  </span>
                  <Button
                    size="sm"
                    disabled={checkedCount === 0}
                    onClick={() => {
                      setDlgGroupKey(groupKey);
                      setForm({ numero_nf: "", observacao: "" });
                      setFile1(null);
                      setFile2(null);
                    }}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Emitir 1 NF
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {g.items.map((n) => (
                  <label
                    key={n.id}
                    className="flex items-center gap-2 text-xs rounded-md border border-border/40 px-2 py-1.5 cursor-pointer hover:bg-secondary/30"
                  >
                    <Checkbox
                      checked={!!selected[n.id]}
                      onCheckedChange={(v) => setSelected({ ...selected, [n.id]: !!v })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{n.sale?.comprador ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {n.sale?.unidade ?? ""} · {fmtBR(n.sale?.data)}
                      </div>
                    </div>
                    <div className="text-right tabular-nums font-medium">{BRL(Number(n.valor_nf) || 0)}</div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!dlgGroupKey} onOpenChange={(o) => !o && setDlgGroupKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir 1 NF · {dlgGroup?.label}</DialogTitle>
            <DialogDescription>
              {dlgSelectedItems.length} adiantamento{dlgSelectedItems.length > 1 ? "s" : ""} ·
              total <b>{BRL(dlgTotal)}</b>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-border/50 bg-muted/20 p-2 max-h-32 overflow-y-auto text-xs space-y-1">
              {dlgSelectedItems.map((n) => (
                <div key={n.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {n.sale?.comprador} · {n.sale?.unidade ?? ""}
                  </span>
                  <span className="tabular-nums">{BRL(Number(n.valor_nf) || 0)}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Número da NF *</Label>
                <Input
                  value={form.numero_nf}
                  onChange={(e) => setForm({ ...form, numero_nf: e.target.value })}
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor total da NF</Label>
                <Input
                  value={BRL(dlgTotal)}
                  readOnly
                  disabled
                  className="bg-muted/40 text-foreground font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Anexos</span>
                <span className="text-[11px] text-muted-foreground">
                  {(file1 ? 1 : 0) + (file2 ? 1 : 0)}/2 · máx 15MB
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "nf", file: file1, setFile: setFile1, label: "Nota Fiscal", required: true },
                  { key: "extra", file: file2, setFile: setFile2, label: "Anexo extra", required: false },
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
            <Button variant="ghost" onClick={() => setDlgGroupKey(null)}>Cancelar</Button>
            <Button
              disabled={
                emitMut.isPending ||
                uploading ||
                !form.numero_nf.trim() ||
                !file1 ||
                dlgSelectedItems.length === 0
              }
              onClick={() => emitMut.mutate()}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              {emitMut.isPending || uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Receipt className="w-4 h-4 mr-1" /> Enviar NF única ({role})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
