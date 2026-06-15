import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUnidadesDisponiveis, type UnidadeDisponivel } from "@/lib/empreendimentos.functions";
import { Building2, RefreshCw, Search, Ruler, Car, Compass, Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BRL = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const Route = createFileRoute("/_authenticated/empreendimentos")({
  component: EmpreendimentosPage,
  head: () => ({ meta: [{ title: "Empreendimentos · Unidades Disponíveis" }] }),
});

function EmpreendimentosPage() {
  const fetchFn = useServerFn(listUnidadesDisponiveis);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["unidades-disponiveis"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const [empFilter, setEmpFilter] = useState<string>("__all__");
  const [torreFilter, setTorreFilter] = useState<string>("__all__");
  const [andarFilter, setAndarFilter] = useState<string>("__all__");
  const [faceFilter, setFaceFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");

  const items = data?.items ?? [];

  const empreendimentos = useMemo(
    () => Array.from(new Set(items.map((i) => i.empreendimento))).sort(),
    [items],
  );
  const torres = useMemo(
    () => Array.from(new Set(items.map((i) => i.torre).filter(Boolean))).sort() as string[],
    [items],
  );
  const andares = useMemo(
    () => Array.from(new Set(items.map((i) => i.andar).filter(Boolean))).sort() as string[],
    [items],
  );
  const faces = useMemo(
    () => Array.from(new Set(items.map((i) => i.orientacao).filter(Boolean))).sort() as string[],
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((u) => {
        if (empFilter !== "__all__" && u.empreendimento !== empFilter) return false;
        if (torreFilter !== "__all__" && u.torre !== torreFilter) return false;
        if (andarFilter !== "__all__" && u.andar !== andarFilter) return false;
        if (faceFilter !== "__all__" && u.orientacao !== faceFilter) return false;
        if (!q) return true;
        return (
          u.unidade.toLowerCase().includes(q) ||
          (u.torre ?? "").toLowerCase().includes(q) ||
          (u.andar ?? "").toLowerCase().includes(q) ||
          (u.tipo ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const na = parseInt(a.unidade, 10) || 0;
        const nb = parseInt(b.unidade, 10) || 0;
        return na - nb;
      });
  }, [items, empFilter, torreFilter, andarFilter, faceFilter, search]);

  const totalDisp = filtered.length;
  const volume = filtered.reduce((s, u) => s + (u.valorVenda ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Empreendimentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unidades <span className="font-semibold text-success">disponíveis</span> em tempo real (Notion).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Disponíveis</div>
            <div className="text-xl font-bold">{totalDisp}</div>
          </div>
          <div className="glass-card px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume</div>
            <div className="text-xl font-bold">{BRL(volume)}</div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm hover:bg-secondary/80"
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-secondary/30 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-medium">Empreendimento:</span>
        </div>
        <Select value={empFilter} onValueChange={(v) => { setEmpFilter(v); setTorreFilter("__all__"); setAndarFilter("__all__"); setFaceFilter("__all__"); }}>
          <SelectTrigger className="h-9 w-[220px] rounded-lg border border-input bg-background text-xs shadow-sm">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {empreendimentos.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span className="font-medium">Torre:</span>
        </div>
        <Select value={torreFilter} onValueChange={setTorreFilter}>
          <SelectTrigger className="h-9 w-[140px] rounded-lg border border-input bg-background text-xs shadow-sm">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {torres.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span className="font-medium">Andar:</span>
        </div>
        <Select value={andarFilter} onValueChange={setAndarFilter}>
          <SelectTrigger className="h-9 w-[140px] rounded-lg border border-input bg-background text-xs shadow-sm">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {andares.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Compass className="h-4 w-4" />
          <span className="font-medium">Face:</span>
        </div>
        <Select value={faceFilter} onValueChange={setFaceFilter}>
          <SelectTrigger className="h-9 w-[180px] rounded-lg border border-input bg-background text-xs shadow-sm">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {faces.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar unidade, tipo…"
            className="h-9 w-[260px] rounded-lg border border-input bg-background pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {error ? (
        <div className="glass-card p-6 text-sm text-destructive">
          Erro ao carregar unidades: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : isLoading ? (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando unidades…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma unidade disponível encontrada.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((u) => (
            <UnidadeCard key={u.id} u={u} />
          ))}
        </div>
      )}

      {data?.updatedAt && (
        <div className="text-right text-[11px] text-muted-foreground">
          Atualizado em {new Date(data.updatedAt).toLocaleString("pt-BR")}
        </div>
      )}
    </div>
  );
}

function UnidadeCard({ u }: { u: UnidadeDisponivel }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="absolute right-4 top-4">
        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
          Disponível
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {u.empreendimento}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="font-display text-2xl font-bold tracking-tight">Unid. {u.unidade}</div>
        {u.torre && <div className="text-xs text-muted-foreground">Torre {u.torre}</div>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {u.andar && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Andar {u.andar}
          </div>
        )}
        {u.tipo && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> {u.tipo}
          </div>
        )}
        {u.areaPrivTotal && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" /> {u.areaPrivTotal} m²
          </div>
        )}
        {u.orientacao && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Compass className="h-3.5 w-3.5" /> {u.orientacao}
          </div>
        )}
        {(u.vg || u.vgNumero) && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Car className="h-3.5 w-3.5" /> Vaga {u.vgNumero ?? u.vg}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-1 border-t border-border/50 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor de venda</span>
          <span className="font-display text-lg font-bold text-primary">{BRL(u.valorVenda)}</span>
        </div>
        {u.valorAvaliacao != null && (
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Avaliação</span>
            <span className="font-medium">{BRL(u.valorAvaliacao)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
