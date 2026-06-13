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

  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Missão de hoje</div>
        <h1 className="font-display text-3xl font-semibold">
          {greeting}{firstName ? `, ${firstName}` : ""} <span className="text-muted-foreground text-base">· {ROLE_LABEL[role]}</span>
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

      {/* Pódio — varia por role */}
      {totals.ticketMedio > 0 && (() => {
        type Tier = {
          key: string;
          big: string;
          unit: string;
          label: string;
          sub: string;
          icon: React.ReactNode;
          heightClass: string;
          order: string;
          grad: string;
          ring: string;
          comissao: number;
          footer: string;
        };

        const styleSmall = {
          icon: <Medal className="w-5 h-5" />,
          heightClass: "md:min-h-44",
          grad: "linear-gradient(135deg, oklch(0.72 0.13 240), oklch(0.55 0.18 250))",
          ring: "ring-sky-400/30",
          label: "Aquecendo",
          sub: "Começo do mês",
        };
        const styleMid = {
          icon: <Trophy className="w-5 h-5" />,
          heightClass: "md:min-h-52",
          grad: "var(--gradient-primary)",
          ring: "ring-primary/30",
          label: "Boa",
          sub: "Mês forte",
        };
        const styleTop = {
          icon: <Crown className="w-6 h-6" />,
          heightClass: "md:min-h-64",
          grad: "var(--gradient-gold)",
          ring: "ring-amber-400/40",
          label: "Lendária",
          sub: "Top performer",
        };

        let title = "Pódio de comissão";
        let subtitle = `Estimativa baseada no ticket médio das unidades disponíveis (${fmtBRL(totals.ticketMedio)}).`;
        let tiers: Tier[] = [];

        if (role === "corretor") {
          const mk = (vendas: number, s: typeof styleSmall, order: string): Tier => {
            const vgv = totals.ticketMedio * vendas;
            return {
              key: `v${vendas}`,
              big: String(vendas),
              unit: vendas === 1 ? "venda" : "vendas",
              label: s.label, sub: s.sub, icon: s.icon,
              heightClass: s.heightClass, grad: s.grad, ring: s.ring,
              order,
              comissao: vgv * pct,
              footer: `sobre VGV de ${fmtBRLCompact(vgv)}`,
            };
          };
          tiers = [
            mk(5, styleMid, "md:order-1"),
            mk(7, styleTop, "md:order-2"),
            mk(2, styleSmall, "md:order-3"),
          ];
        } else if (role === "gerente") {
          title = "Pódio do gerente";
          subtitle = `Estimativa: cada corretor com 2 vendas/mês no ticket médio (${fmtBRL(totals.ticketMedio)}) e override de ${(pct * 100).toFixed(2).replace(".", ",")}%.`;
          const vendasMedia = 2;
          const mk = (corretores: number, s: typeof styleSmall, order: string): Tier => {
            const vendas = corretores * vendasMedia;
            const vgv = totals.ticketMedio * vendas;
            return {
              key: `c${corretores}`,
              big: String(corretores),
              unit: corretores === 1 ? "corretor ativo" : "corretores ativos",
              label: s.label, sub: s.sub, icon: s.icon,
              heightClass: s.heightClass, grad: s.grad, ring: s.ring,
              order,
              comissao: vgv * pct,
              footer: `${vendas} vendas · VGV ${fmtBRLCompact(vgv)}`,
            };
          };
          tiers = [
            mk(10, styleMid, "md:order-1"),
            mk(15, styleTop, "md:order-2"),
            mk(5, styleSmall, "md:order-3"),
          ];
        } else {
          // diretor
          title = "Pódio da diretoria";
          subtitle = `Override de ${(pct * 100).toFixed(2).replace(".", ",")}% sobre o VGV vendido pela construtora no mês.`;
          const mk = (vgv: number, big: string, s: typeof styleSmall, order: string): Tier => ({
            key: `d${vgv}`,
            big,
            unit: "em VGV",
            label: s.label, sub: s.sub, icon: s.icon,
            heightClass: s.heightClass, grad: s.grad, ring: s.ring,
            order,
            comissao: vgv * pct,
            footer: `meta mensal da construtora`,
          });
          tiers = [
            mk(7_000_000, "R$ 7M", styleMid, "md:order-1"),
            mk(10_000_000, "R$ 10M", styleTop, "md:order-2"),
            mk(5_000_000, "R$ 5M", styleSmall, "md:order-3"),
          ];
        }

        return (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground hidden md:block">
                Quanto você leva pra casa
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {tiers.map((t, i) => (
                <motion.div
                  key={t.key}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.45 }}
                  className={`glass-card relative overflow-hidden p-6 flex flex-col justify-end ring-1 ${t.ring} ${t.heightClass} ${t.order}`}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: t.grad }} />
                  <div className="pointer-events-none absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-50" style={{ background: t.grad }} />
                  <div className="relative flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md text-background"
                      style={{ background: t.grad }}
                    >
                      {t.icon}
                      {t.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t.sub}
                    </span>
                  </div>
                  <div className="relative mt-4">
                    <div className="font-display text-5xl md:text-6xl font-extrabold leading-none">
                      {t.big}
                      <span className="text-base font-medium text-muted-foreground ml-2">
                        {t.unit}
                      </span>
                    </div>
                  </div>
                  <div className="relative mt-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Comissão estimada
                    </div>
                    <div
                      className="font-display text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                      style={{ backgroundImage: t.grad }}
                    >
                      {fmtBRL(t.comissao)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{t.footer}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        );
      })()}

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

      {/* Pódio — varia por role */}
      {totals.ticketMedio > 0 && (() => {
        type Tier = {
          key: string;
          big: string;
          unit: string;
          label: string;
          sub: string;
          icon: React.ReactNode;
          heightClass: string;
          order: string;
          grad: string;
          ring: string;
          comissao: number;
          footer: string;
        };

        const styleSmall = {
          icon: <Medal className="w-5 h-5" />,
          heightClass: "md:min-h-44",
          grad: "linear-gradient(135deg, oklch(0.72 0.13 240), oklch(0.55 0.18 250))",
          ring: "ring-sky-400/30",
          label: "Aquecendo",
          sub: "Começo do mês",
        };
        const styleMid = {
          icon: <Trophy className="w-5 h-5" />,
          heightClass: "md:min-h-52",
          grad: "var(--gradient-primary)",
          ring: "ring-primary/30",
          label: "Boa",
          sub: "Mês forte",
        };
        const styleTop = {
          icon: <Crown className="w-6 h-6" />,
          heightClass: "md:min-h-64",
          grad: "var(--gradient-gold)",
          ring: "ring-amber-400/40",
          label: "Lendária",
          sub: "Top performer",
        };

        let title = "Pódio de comissão";
        let subtitle = `Estimativa baseada no ticket médio das unidades disponíveis (${fmtBRL(totals.ticketMedio)}).`;
        let tiers: Tier[] = [];

        if (role === "corretor") {
          const mk = (vendas: number, s: typeof styleSmall, order: string): Tier => {
            const vgv = totals.ticketMedio * vendas;
            return {
              key: `v${vendas}`,
              big: String(vendas),
              unit: vendas === 1 ? "venda" : "vendas",
              label: s.label, sub: s.sub, icon: s.icon,
              heightClass: s.heightClass, grad: s.grad, ring: s.ring,
              order,
              comissao: vgv * pct,
              footer: `sobre VGV de ${fmtBRLCompact(vgv)}`,
            };
          };
          tiers = [
            mk(5, styleMid, "md:order-1"),
            mk(7, styleTop, "md:order-2"),
            mk(2, styleSmall, "md:order-3"),
          ];
        } else if (role === "gerente") {
          title = "Pódio do gerente";
          subtitle = `Estimativa: cada corretor com 2 vendas/mês no ticket médio (${fmtBRL(totals.ticketMedio)}) e override de ${(pct * 100).toFixed(2).replace(".", ",")}%.`;
          const vendasMedia = 2;
          const mk = (corretores: number, s: typeof styleSmall, order: string): Tier => {
            const vendas = corretores * vendasMedia;
            const vgv = totals.ticketMedio * vendas;
            return {
              key: `c${corretores}`,
              big: String(corretores),
              unit: corretores === 1 ? "corretor ativo" : "corretores ativos",
              label: s.label, sub: s.sub, icon: s.icon,
              heightClass: s.heightClass, grad: s.grad, ring: s.ring,
              order,
              comissao: vgv * pct,
              footer: `${vendas} vendas · VGV ${fmtBRLCompact(vgv)}`,
            };
          };
          tiers = [
            mk(10, styleMid, "md:order-1"),
            mk(15, styleTop, "md:order-2"),
            mk(5, styleSmall, "md:order-3"),
          ];
        } else {
          // diretor
          title = "Pódio da diretoria";
          subtitle = `Override de ${(pct * 100).toFixed(2).replace(".", ",")}% sobre o VGV vendido pela construtora no mês.`;
          const mk = (vgv: number, big: string, s: typeof styleSmall, order: string): Tier => ({
            key: `d${vgv}`,
            big,
            unit: "em VGV",
            label: s.label, sub: s.sub, icon: s.icon,
            heightClass: s.heightClass, grad: s.grad, ring: s.ring,
            order,
            comissao: vgv * pct,
            footer: `meta mensal da construtora`,
          });
          tiers = [
            mk(7_000_000, "R$ 7M", styleMid, "md:order-1"),
            mk(10_000_000, "R$ 10M", styleTop, "md:order-2"),
            mk(5_000_000, "R$ 5M", styleSmall, "md:order-3"),
          ];
        }

        return (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground hidden md:block">
                Quanto você leva pra casa
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {tiers.map((t, i) => (
                <motion.div
                  key={t.key}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.45 }}
                  className={`glass-card relative overflow-hidden p-6 flex flex-col justify-end ring-1 ${t.ring} ${t.heightClass} ${t.order}`}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: t.grad }} />
                  <div className="pointer-events-none absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-50" style={{ background: t.grad }} />
                  <div className="relative flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md text-background"
                      style={{ background: t.grad }}
                    >
                      {t.icon}
                      {t.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t.sub}
                    </span>
                  </div>
                  <div className="relative mt-4">
                    <div className="font-display text-5xl md:text-6xl font-extrabold leading-none">
                      {t.big}
                      <span className="text-base font-medium text-muted-foreground ml-2">
                        {t.unit}
                      </span>
                    </div>
                  </div>
                  <div className="relative mt-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Comissão estimada
                    </div>
                    <div
                      className="font-display text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                      style={{ backgroundImage: t.grad }}
                    >
                      {fmtBRL(t.comissao)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{t.footer}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
