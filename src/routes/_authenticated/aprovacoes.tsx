import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import data from "@/data/approvals.json";
import type { Approval } from "@/components/aprovacoes/types";
import { KpiCards } from "@/components/aprovacoes/KpiCards";
import { StatusDonut } from "@/components/aprovacoes/StatusDonut";
import { BrokerBars } from "@/components/aprovacoes/BrokerBars";
import { CartaSplit } from "@/components/aprovacoes/CartaSplit";
import { EmpreendimentoBars } from "@/components/aprovacoes/EmpreendimentoBars";
import { TimelineChart } from "@/components/aprovacoes/TimelineChart";
import { TopClients } from "@/components/aprovacoes/TopClients";
import { ClientsTable } from "@/components/aprovacoes/ClientsTable";
import { parseBR } from "@/components/aprovacoes/utils";
import { isHouse } from "@/lib/team";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, TrendingUp, CalendarDays, X, Users, Building2 } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/aprovacoes")({
  component: AprovacoesPage,
  head: () => ({
    meta: [{ title: "Aprovações · Gestão Comercial" }],
  }),
});

function AprovacoesPage() {
  const allRows = data as Approval[];
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(iso(firstOfMonth));
  const [dateTo, setDateTo] = useState(iso(today));
  const [corretorFilter, setCorretorFilter] = useState<string>("__all__");
  const [empreendimentoFilter, setEmpreendimentoFilter] = useState<string>("__all__");

  const corretores = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.corretor).filter(Boolean))).sort(),
    [allRows]
  );
  const empreendimentos = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.empreendimento).filter(Boolean))).sort(),
    [allRows]
  );

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      const d = parseBR(r.dataEntrada);
      if (!d) return false;
      if (dateFrom) {
        const from = new Date(dateFrom + "T00:00:00");
        if (d < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + "T23:59:59");
        if (d > to) return false;
      }
      if (corretorFilter !== "__all__" && r.corretor !== corretorFilter) return false;
      if (empreendimentoFilter !== "__all__" && r.empreendimento !== empreendimentoFilter) return false;
      return true;
    });
  }, [allRows, dateFrom, dateTo, corretorFilter, empreendimentoFilter]);

  const activeFilter = dateFrom || dateTo || corretorFilter !== "__all__" || empreendimentoFilter !== "__all__";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" />
            BI · EURO Empreendimentos
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Painel de <span className="text-gradient-primary">Aprovações</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Análise executiva de financiamentos imobiliários — clientes, corretores, empreendimentos e performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="approvals-glass rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Período
            </div>
            <div className="mt-1 text-sm font-semibold">
              {activeFilter
                ? `${dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR") : "Início"} – ${dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR") : "Hoje"}`
                : "Mar – Mai 2026"}
            </div>
          </div>
          <div className="approvals-glass rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Registros
            </div>
            <div className="mt-1 text-sm font-semibold">{filtered.length} processos</div>
          </div>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 1 }}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-secondary/30 p-3 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span className="font-medium">Período:</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
            placeholder="De"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
            placeholder="Até"
          />
        </div>

        <div className="h-5 w-px bg-border/60" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-medium">Corretor:</span>
        </div>
        <Select value={corretorFilter} onValueChange={setCorretorFilter}>
          <SelectTrigger className="h-9 w-[160px] rounded-lg border border-input bg-background text-xs shadow-sm focus:ring-1 focus:ring-ring">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {corretores.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border/60" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-medium">Empreendimento:</span>
        </div>
        <Select value={empreendimentoFilter} onValueChange={setEmpreendimentoFilter}>
          <SelectTrigger className="h-9 w-[180px] rounded-lg border border-input bg-background text-xs shadow-sm focus:ring-1 focus:ring-ring">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {empreendimentos.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilter && (
          <button
            onClick={() => {
              setDateFrom(iso(firstOfMonth));
              setDateTo(iso(today));
              setCorretorFilter("__all__");
              setEmpreendimentoFilter("__all__");
            }}
            className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/20"
          >
            <X className="h-3 w-3" /> Limpar
          </button>
        )}
      </motion.div>

      <KpiCards rows={filtered} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4"><StatusDonut rows={filtered} /></div>
        <div className="lg:col-span-5"><BrokerBars rows={filtered} /></div>
        <div className="lg:col-span-3"><CartaSplit rows={filtered} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7"><EmpreendimentoBars rows={filtered} /></div>
        <div className="lg:col-span-5"><TimelineChart rows={filtered} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4"><TopClients rows={filtered} /></div>
        <div className="lg:col-span-8"><ClientsTable rows={filtered} /></div>
      </div>
    </div>
  );
}
