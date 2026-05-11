import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/corretores")({ component: Page });

function Page() {
  const { data = [] } = useQuery({
    queryKey: ["sales-corr"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("corretor,valor_venda,comissao_bruta").limit(5000);
      return data ?? [];
    },
  });
  const map: Record<string, { vgv: number; com: number; n: number }> = {};
  for (const r of data) {
    const k = r.corretor ?? "—";
    if (!map[k]) map[k] = { vgv: 0, com: 0, n: 0 };
    map[k].vgv += r.valor_venda ?? 0; map[k].com += r.comissao_bruta ?? 0; map[k].n += 1;
  }
  const rows = Object.entries(map).sort((a, b) => b[1].vgv - a[1].vgv);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Análise</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Ranking de corretores</h1>
      </div>
      <div className="glass-card p-2">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">#</th><th className="text-left p-3">Corretor</th><th className="text-right p-3">Vendas</th><th className="text-right p-3">VGV</th><th className="text-right p-3">Comissão</th></tr>
          </thead>
          <tbody>
            {rows.map(([name, v], i) => (
              <tr key={name} className="border-t border-border hover:bg-secondary/30">
                <td className="p-3 text-muted-foreground">{i + 1}</td>
                <td className="p-3 font-medium">{name}</td>
                <td className="p-3 text-right">{fmtNum(v.n)}</td>
                <td className="p-3 text-right text-gradient-primary font-medium">{fmtBRL(v.vgv)}</td>
                <td className="p-3 text-right">{fmtBRL(v.com)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
