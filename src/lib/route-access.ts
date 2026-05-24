/**
 * Matriz de acesso por rota.
 * - Admin: tudo
 * - Diretor (Gerente Geral): mesma visibilidade do admin nas áreas comerciais
 *   (Dashboard até Insights, leitura), MAIS seu próprio Painel Financeiro em /diretor.
 *   NÃO acessa Administração nem o painel financeiro interno (/financeiro, /distratos).
 */
export interface Caps {
  isAdmin: boolean;
  isDiretor: boolean;
  isFinanceiro: boolean;
  isGerente: boolean;
  isCorretor: boolean;
}

type Rule = { match: (path: string) => boolean; allow: (c: Caps) => boolean };

const RULES: Rule[] = [
  // Conta — qualquer usuário autenticado
  { match: (p) => p === "/conta" || p.startsWith("/conta/"), allow: () => true },

  // Administração — só admin
  { match: (p) => p.startsWith("/admin"), allow: (c) => c.isAdmin },

  // Painel financeiro interno — admin OU financeiro
  { match: (p) => p === "/financeiro" || p.startsWith("/financeiro/"), allow: (c) => c.isAdmin || c.isFinanceiro },
  { match: (p) => p === "/distratos" || p.startsWith("/distratos/"), allow: (c) => c.isAdmin || c.isFinanceiro },

  // Comissões (painel do corretor) — admin OU corretor
  { match: (p) => p === "/comissoes" || p.startsWith("/comissoes/"), allow: (c) => c.isAdmin || c.isCorretor },

  // Painel Financeiro do Diretor (Gerente Geral) — admin OU diretor
  { match: (p) => p === "/diretor" || p.startsWith("/diretor/"), allow: (c) => c.isAdmin || c.isDiretor },

  // Minha Equipe — admin OU gerente
  { match: (p) => p === "/equipe" || p.startsWith("/equipe/"), allow: (c) => c.isAdmin || c.isGerente },

  // Painel do Gerente (financeiro) — admin OU gerente
  { match: (p) => p === "/gerentes" || p.startsWith("/gerentes/"), allow: (c) => c.isAdmin || c.isGerente },

  // Área comercial completa (Dashboard, Vendas, Agendamentos, Corretores,
  // Empreendimentos, Aprovações, Insights) — admin OU diretor (leitura).
  { match: (p) => p === "/", allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/vendas" || p.startsWith("/vendas/"), allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/agendamentos" || p.startsWith("/agendamentos/"), allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/corretores" || p.startsWith("/corretores/"), allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/empreendimentos" || p.startsWith("/empreendimentos/"), allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/aprovacoes" || p.startsWith("/aprovacoes/"), allow: (c) => c.isAdmin || c.isDiretor },
  { match: (p) => p === "/insights" || p.startsWith("/insights/"), allow: (c) => c.isAdmin || c.isDiretor },
];

export function canAccess(pathname: string, caps: Caps): boolean {
  const rule = RULES.find((r) => r.match(pathname));
  if (!rule) return true;
  return rule.allow(caps);
}

/** Rota "home" da role (para onde redirecionar quando a rota atual é proibida). */
export function homeRouteFor(caps: Caps): string {
  if (caps.isAdmin) return "/";
  if (caps.isDiretor) return "/";
  if (caps.isGerente) return "/equipe";
  if (caps.isFinanceiro) return "/financeiro";
  if (caps.isCorretor) return "/comissoes";
  return "/login";
}
