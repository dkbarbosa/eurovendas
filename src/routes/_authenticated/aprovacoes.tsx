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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    if (!dateFrom && !dateTo) return allRows;
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
    return allRows.filter((r) => {
      const d = parseBR(r.dataEntrada);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [allRows, dateFrom, dateTo]);

  const activeFilter = dateFrom || dateTo;

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
          <span className="font-medium">Filtro por período:</span>
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
        {activeFilter && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
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
