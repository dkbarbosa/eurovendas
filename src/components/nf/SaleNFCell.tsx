import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyNFs, markNFEmitted, markNFPaid } from "@/lib/nf.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Receipt, Upload, Loader2, CheckCircle2, Paperclip, X, Wallet, AlertTriangle } from "lucide-react";
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
  requester_role: "corretor" | "gerente" | "diretor" | string;
  desconto_distrato?: number | null;
  observacao_distrato?: string | null;
  sale: {
    id: string;
    data: string | null;
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    valor_venda: number | null;
    status?: string | null;
  } | null;
};


const ROLE_LABEL: Record<string, string> = {
  corretor: "Corretor",
  gerente: "Gerente",
  diretor: "Gestão",
};

const ROLE_ADIANT: Record<string, string> = {
  corretor: "R$ 1.000,00",
  gerente: "R$ 500,00",
  diretor: "R$ 300,00",
};

function RoleRulesBlock({ role }: { role: string }) {
  const adiant = ROLE_ADIANT[role] ?? "R$ 1.000,00";
  const rules = [
    `Adiantamento (${ROLE_LABEL[role] ?? "Corretor"}): ${adiant} a cada R$ 2.999,99 de sinal (mínimo R$ 2.999,99).`,
    "Comissão final: sinal ≥ 6% do VGV.",
    "Comissão cheia: quando o status da venda estiver em Caixa.",
  ];
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-xs space-y-1.5">
      <div className="font-medium text-amber-300 inline-flex items-center gap-1.5">
        <Receipt className="w-3.5 h-3.5" />
        Regras de adiantamento · {ROLE_LABEL[role] ?? "Corretor"}
      </div>
      <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
        {rules.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      <p className="text-[11px] text-muted-foreground/80 pt-1 border-t border-amber-400/20">
        O valor já foi aprovado pelo financeiro e não pode ser alterado.
      </p>
    </div>
  );
}


export function NFPill({ n, saleStatus }: { n: { status: string; numero_nf: string | null }; saleStatus?: string | null }) {
  let label: string | null = n.status;
  if (n.status === "paga") {
    const stUp = (saleStatus ?? "").trim().toUpperCase();
    label = stUp === "CAIXA" ? "finalizado" : null;
  }
  const isPaga = n.status === "paga";
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border ${STATUS_STYLE[n.status] ?? ""}`}>
        <Receipt className="w-3 h-3" /> NF {n.numero_nf ? `#${n.numero_nf}` : ""}{label ? ` · ${label}` : ""}
      </div>
      {isPaga && (
        <>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> NF recebida
          </div>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border bg-primary/10 text-primary border-primary/30">
            <Wallet className="w-3 h-3" /> Adiantamento pago
          </div>
        </>
      )}
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
              <Label>Valor da NF (R$) · aprovado</Label>
              <Input
                value={BRL(form.valor_nf || 0)}
                readOnly
                disabled
                className="bg-muted/40 text-foreground font-medium cursor-not-allowed"
              />
            </div>
          </div>

          {nf?.requester_role && <RoleRulesBlock role={nf.requester_role} />}


          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Anexos</span>
              <span className="text-[11px] text-muted-foreground">{(file1 ? 1 : 0) + (file2 ? 1 : 0)}/2 · máx 15MB</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "nf", file: file1, setFile: setFile1, label: "Nota Fiscal", required: true },
                { key: "pr", file: file2, setFile: setFile2, label: "Promissória", required: false },
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
export function SaleNFCell({ saleId, role }: { saleId: string; role?: "corretor" | "gerente" | "diretor" }) {
  const qc = useQueryClient();
  const fnPay = useServerFn(markNFPaid);
  const { data: nfs = [] } = useMyNFs();
  const sNfs = useMemo(
    () => nfs.filter((n) => n.sale_id === saleId && (!role || (n.requester_role ?? "corretor") === role)),
    [nfs, saleId, role],
  );
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


  if (sNfs.length === 0) return null;

  const hasEnviarNF = !!nfAberta;

  return (
    <>
      <div className="space-y-1">
        {sNfs.map((n) => {
          const desc = Number(n.desconto_distrato) || 0;
          const distHist = n.observacao_distrato?.trim();
          const hasDist = desc > 0 || !!distHist;
          return (
            <div key={n.id} className="space-y-1">
              <div className="flex items-center gap-1 flex-wrap">
                <NFPill n={n} saleStatus={n.sale?.status as string | undefined} />
                {!hasEnviarNF && (n.status === "emitida" || n.status === "recebida") && (
                  <Button
                    size="sm"
                    disabled={payMut.isPending}
                    onClick={() => {
                      if (confirm("Confirmar que o pagamento foi recebido? Isso finaliza o processo.")) payMut.mutate(n.id);
                    }}
                    className="h-6 px-2 text-[11px]"
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <Wallet className="w-3 h-3 mr-1" /> Recebido
                  </Button>
                )}
                {hasDist && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-violet-400/40 bg-violet-500/10 text-violet-300 text-[10px] hover:bg-violet-500/20"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {desc > 0 ? `Distrato −${BRL(desc)}` : "Distrato"} · Ver histórico
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 text-xs space-y-2">
                      <div className="font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-violet-400" /> Histórico de distrato
                      </div>
                      {desc > 0 && <div>Desconto aplicado: <b>{BRL(desc)}</b></div>}
                      {distHist ? (
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{distHist}</div>
                      ) : (
                        <div className="text-muted-foreground italic">Sem observação registrada.</div>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
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
