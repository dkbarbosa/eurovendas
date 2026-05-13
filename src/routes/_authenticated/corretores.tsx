import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtNum } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/corretores")({ component: Page });

const TOOLTIP = {
  background: "oklch(0.16 0.02 270)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: 12,
  fontSize: 12,
};
const COLORS = ["oklch(0.82 0.16 185)", "oklch(0.78 0.12 82)", "oklch(0.7 0.18 30)", "oklch(0.6 0.18 300)", "oklch(0.65 0.18 140)", "oklch(0.7 0.15 250)", "oklch(0.75 0.16 50)"];

function Page() {
  const { data = [] } = useQuery({
    queryKey: ["sales-corr"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("corretor,valor_venda,comissao_bruta").limit(5000);
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const map: Record<string, { vgv: number; com: number; n: number }> = {};
    for (const r of data) {
      const k = r.corretor ?? "—";
      if (!map[k]) map[k] = { vgv: 0, com: 0, n: 0 };
      map[k].vgv += r.valor_venda ?? 0;
      map[k].com += r.comissao_bruta ?? 0;
      map[k].n += 1;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.vgv - a.vgv);
  }, [data]);

  const top = rows.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Ranking de corretores</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glass-card p-5 lg:col-span-7"
        >
          <div className="text-sm font-medium mb-3">Top 10 · VGV por corretor</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="corrBar" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="oklch(0.55 0.13 200)" />
                    <stop offset="100%" stopColor="oklch(0.82 0.16 185)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 6%)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.72 0.02 270)" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.85 0.02 270)" }} width={90} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "oklch(1 0 0 / 4%)" }} contentStyle={TOOLTIP}
                  formatter={(v: number, _n, p) => [`${fmtBRL(v)} · ${p?.payload?.n} vendas`, "VGV"]} />
                <Bar dataKey="vgv" fill="url(#corrBar)" radius={[0, 8, 8, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="glass-card p-5 lg:col-span-5"
        >
          <div className="text-sm font-medium mb-3">Distribuição de comissões</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Pie data={top} dataKey="com" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={2} stroke="none" animationDuration={900}>
                  {top.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="glass-card p-2"
      >
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">#</th><th className="text-left p-3">Corretor</th><th className="text-right p-3">Vendas</th><th className="text-right p-3">VGV</th><th className="text-right p-3">Comissão</th></tr>
          </thead>
          <tbody>
            {rows.map((v, i) => (
              <tr key={v.name} className="border-t border-border hover:bg-secondary/30">
                <td className="p-3 text-muted-foreground">{i + 1}</td>
                <td className="p-3 font-medium">{v.name}</td>
                <td className="p-3 text-right">{fmtNum(v.n)}</td>
                <td className="p-3 text-right text-gradient-primary font-medium">{fmtBRL(v.vgv)}</td>
                <td className="p-3 text-right">{fmtBRL(v.com)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
