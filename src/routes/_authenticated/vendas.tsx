import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtDate } from "@/lib/format";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/vendas")({ component: Vendas });

function Vendas() {
  const [q, setQ] = useState("");
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-all"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*").order("data", { ascending: false }).limit(5000);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return sales.filter((r) =>
      !s || [r.empreendimento, r.unidade, r.comprador, r.corretor, r.gerente, r.status]
        .filter(Boolean).join(" ").toLowerCase().includes(s)
    );
  }, [sales, q]);

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `vendas-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Tabela de vendas</h1>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 w-64" />
          </div>
          <Button onClick={exportXlsx} variant="secondary"><Download className="w-4 h-4 mr-2" />Excel</Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Empreendimento</th>
                <th className="text-left p-3">Unidade</th>
                <th className="text-left p-3">Comprador</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-left p-3">Corretor</th>
                <th className="text-left p-3">Gerente</th>
                <th className="text-right p-3">Comissão</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3">{fmtDate(r.data)}</td>
                  <td className="p-3 font-medium">{r.empreendimento}</td>
                  <td className="p-3 text-muted-foreground">{r.unidade}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-[200px]">{r.comprador}</td>
                  <td className="p-3 text-right">{fmtBRL(r.valor_venda)}</td>
                  <td className="p-3">{r.corretor}</td>
                  <td className="p-3 text-muted-foreground">{r.gerente}</td>
                  <td className="p-3 text-right text-success">{fmtBRL(r.comissao_bruta)}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-secondary text-xs">{r.status ?? "—"}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma venda encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
