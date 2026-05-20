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
import { Activity, TrendingUp, CalendarDays, X } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/aprovacoes")({
  component: AprovacoesPage,
  head: () => ({
    meta: [{ title: "Aprovações · Gestão Comercial" }],
  }),
});

function AprovacoesPage() {
  const rows = data as Approval[];
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
            <div className="mt-1 text-sm font-semibold">Mar – Mai 2026</div>
          </div>
          <div className="approvals-glass rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Registros
            </div>
            <div className="mt-1 text-sm font-semibold">{rows.length} processos</div>
          </div>
        </div>
      </header>

      <KpiCards rows={rows} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4"><StatusDonut rows={rows} /></div>
        <div className="lg:col-span-5"><BrokerBars rows={rows} /></div>
        <div className="lg:col-span-3"><CartaSplit rows={rows} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7"><EmpreendimentoBars rows={rows} /></div>
        <div className="lg:col-span-5"><TimelineChart rows={rows} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4"><TopClients rows={rows} /></div>
        <div className="lg:col-span-8"><ClientsTable rows={rows} /></div>
      </div>
    </div>
  );
}
