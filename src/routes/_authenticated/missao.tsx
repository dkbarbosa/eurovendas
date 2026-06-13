import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, Target, Wallet, Building2, Layers, Loader2, Trophy, Medal, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KPICard } from "@/components/KPICard";
import { listUnidadesDisponiveis, type UnidadeDisponivel } from "@/lib/empreendimentos.functions";
import { getDailyMessage } from "@/lib/missao.functions";
import { fmtBRL, fmtBRLCompact } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/missao")({
  component: MissaoPage,
  errorComponent: ({ error }) => (
    <div className="glass-card p-6 text-sm text-destructive">{String(error)}</div>
  ),
});

type Role = "corretor" | "gerente" | "diretor";
const PCT: Record<Role, number> = { corretor: 0.016, gerente: 0.007, diretor: 0.004 };
const ROLE_LABEL: Record<Role, string> = {
  corretor: "Corretor",
  gerente: "Gerente",
  diretor: "Diretoria",
};

function MissaoPage() {
  const { isDiretor, isGerente, isCorretor, user } = useAuth();
  const role: Role = isDiretor ? "diretor" : isGerente ? "gerente" : "corretor";
  const pct = PCT[role];

  const unidadesFn = useServerFn(listUnidadesDisponiveis);
  const dailyFn = useServerFn(getDailyMessage);

  const unidadesQ = useQuery({
    queryKey: ["missao", "unidades-disponiveis"],
    queryFn: () => unidadesFn() as Promise<{ items: UnidadeDisponivel[]; updatedAt: string }>,
    staleTime: 5 * 60_000,
  });
  const dailyQ = useQuery({
    queryKey: ["missao", "daily", role],
    queryFn: () =>
      dailyFn({ data: { role } }) as Promise<{
        frase: string;
        autor: string;
        acaoTitulo: string;
        acaoDescricao: string;
        dateKey: string;
      }>,
    staleTime: 60 * 60_000,
  });

  const totals = useMemo(() => {
    const items = unidadesQ.data?.items ?? [];
    const comUnid = items.filter((u) => typeof u.valorVenda === "number" && (u.valorVenda ?? 0) > 0);
    const vgvTotal = comUnid.reduce((s, u) => s + (u.valorVenda ?? 0), 0);
    const comissaoMesa = vgvTotal * pct;
    const porEmp = new Map<string, { vgv: number; n: number }>();
    for (const u of comUnid) {
      const e = porEmp.get(u.empreendimento) ?? { vgv: 0, n: 0 };
      e.vgv += u.valorVenda ?? 0;
      e.n += 1;
      porEmp.set(u.empreendimento, e);
    }
    const empreendimentos = Array.from(porEmp.entries())
      .map(([nome, v]) => ({ nome, vgv: v.vgv, n: v.n, comissao: v.vgv * pct }))
      .sort((a, b) => b.vgv - a.vgv);
    const ticketMedio = comUnid.length > 0 ? vgvTotal / comUnid.length : 0;
    return {
      vgvTotal,
      comissaoMesa,
      nUnidades: comUnid.length,
      empreendimentos,
      ticketMedio,
    };
  }, [unidadesQ.data, pct]);

  const firstName =
    ((user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? "")
      .split(/[\s@]/)[0] || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Missão de hoje</div>
        <h1 className="font-display text-3xl font-semibold">
          Bom dia{firstName ? `, ${firstName}` : ""} <span className="text-muted-foreground text-base">· {ROLE_LABEL[role]}</span>
        </h1>
      </div>

      {/* Mensagem e Ação do dia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card p-6 relative overflow-hidden"
        >
          <div
            className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--gradient-gold)" }}
          />
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md text-background"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Mensagem do dia
            </span>
          </div>
          {dailyQ.isLoading ? (
            <div className="mt-4 text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Recebendo inspiração…
            </div>
          ) : (
            <>
              <blockquote
                className="mt-4 font-display text-2xl md:text-[1.7rem] leading-snug font-semibold bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, oklch(0.98 0.02 90), oklch(0.85 0.14 80))" }}
              >
                “{dailyQ.data?.frase}”
              </blockquote>
              {dailyQ.data?.autor && (
                <div className="mt-3 text-sm font-medium tracking-wide text-foreground/80">
                  — {dailyQ.data.autor}
                </div>
              )}
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="glass-card p-6 relative overflow-hidden"
        >
          <div
            className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--gradient-primary)" }}
          />
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md text-background"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Target className="w-3.5 h-3.5" />
              Ação de hoje
            </span>
          </div>
          {dailyQ.isLoading ? (
            <div className="mt-4 text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparando ação…
            </div>
          ) : (
            <>
              <div
                className="mt-4 font-display text-2xl md:text-[1.6rem] font-semibold leading-snug bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, oklch(0.95 0.03 200), oklch(0.78 0.16 195))" }}
              >
                {dailyQ.data?.acaoTitulo}
              </div>
              <p className="mt-2 text-[15px] text-foreground/85 leading-relaxed">
                {dailyQ.data?.acaoDescricao}
              </p>
            </>
          )}
        </motion.div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Comissão na sua mesa"
          value={totals.comissaoMesa}
          format={fmtBRL}
          icon={<Wallet className="w-5 h-5" />}
          accent="gold"
          hint={`Sua % de comissão: ${(pct * 100).toFixed(2).replace(".", ",")}%`}
          index={0}
        />
        <KPICard
          label="VGV disponível"
          value={totals.vgvTotal}
          format={fmtBRL}
          icon={<Building2 className="w-5 h-5" />}
          accent="teal"
          hint="Soma do valor de tabela das unidades em estoque"
          index={1}
        />
        <KPICard
          label="Unidades disponíveis"
          value={totals.nUnidades}
          format={(n) => String(Math.round(n))}
          icon={<Layers className="w-5 h-5" />}
          accent="azure"
          hint="Atualizado direto do Notion"
          index={2}
        />
      </div>

      {unidadesQ.isLoading && (
        <div className="glass-card p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando estoque do Notion…
        </div>
      )}
      {unidadesQ.error && (
        <div className="glass-card p-6 text-sm text-destructive">
          Falha ao carregar estoque: {String(unidadesQ.error)}
        </div>
      )}

      {/* Por empreendimento */}
      {totals.empreendimentos.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Por empreendimento</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {totals.empreendimentos.map((e, i) => (
              <motion.div
                key={e.nome}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass-card p-5"
              >
                <div className="text-sm font-semibold truncate">{e.nome}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {e.n} {e.n === 1 ? "unidade" : "unidades"} disponíveis
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Comissão potencial
                    </div>
                    <div className="font-display text-xl font-semibold">{fmtBRL(e.comissao)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">VGV</div>
                    <div className="text-sm">{fmtBRLCompact(e.vgv)}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Top unidades por empreendimento */}
      {totals.porEmpTop.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Top unidades por empreendimento</h2>
          {totals.porEmpTop.map((grupo) => (
            <div key={grupo.nome} className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-secondary/30 flex items-center justify-between">
                <div className="text-sm font-semibold">{grupo.nome}</div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Top {grupo.top.length} por ticket
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-muted-foreground bg-secondary/20">
                  <tr>
                    <th className="text-left px-4 py-2.5">Unidade</th>
                    <th className="text-left px-4 py-2.5">Torre / Andar</th>
                    <th className="text-right px-4 py-2.5">Valor</th>
                    <th className="text-right px-4 py-2.5">Sua comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.top.map((u) => (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{u.unidade}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[u.torre, u.andar].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{fmtBRL(u.valorVenda ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {fmtBRL((u.valorVenda ?? 0) * pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
