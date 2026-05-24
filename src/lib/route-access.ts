/**
 * Matriz de acesso por rota. Mantém TODA política de visibilidade num lugar só.
 * Usado pelo `_authenticated` layout para redirecionar usuários que tentam
 * acessar rotas fora do escopo da role deles. Usado também pelo AppShell
 * para decidir o que mostrar na sidebar (mesma fonte da verdade).
 */
export interface Caps {
  isAdmin: boolean;
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

  // Painel financeiro — admin OU financeiro
  { match: (p) => p === "/financeiro" || p.startsWith("/financeiro/"), allow: (c) => c.isAdmin || c.isFinanceiro },
  { match: (p) => p === "/distratos" || p.startsWith("/distratos/"), allow: (c) => c.isAdmin || c.isFinanceiro },

  // Comissões (painel do corretor) — admin OU corretor (gerente NÃO vê)
  { match: (p) => p === "/comissoes" || p.startsWith("/comissoes/"), allow: (c) => c.isAdmin || c.isCorretor },

  // Minha Equipe — admin OU gerente
  { match: (p) => p === "/equipe" || p.startsWith("/equipe/"), allow: (c) => c.isAdmin || c.isGerente },

  // Painel do Gerente — admin OU gerente (home do gerente)
  { match: (p) => p === "/gerentes" || p.startsWith("/gerentes/"), allow: (c) => c.isAdmin || c.isGerente },

  // Área comercial completa (Dashboard, Vendas, Agendamentos, Corretores,
  // Empreendimentos, Aprovações, Insights) — SOMENTE admin.
  { match: (p) => p === "/", allow: (c) => c.isAdmin },
  { match: (p) => p === "/vendas" || p.startsWith("/vendas/"), allow: (c) => c.isAdmin },
  { match: (p) => p === "/agendamentos" || p.startsWith("/agendamentos/"), allow: (c) => c.isAdmin },
  { match: (p) => p === "/corretores" || p.startsWith("/corretores/"), allow: (c) => c.isAdmin },
  { match: (p) => p === "/empreendimentos" || p.startsWith("/empreendimentos/"), allow: (c) => c.isAdmin },
  { match: (p) => p === "/aprovacoes" || p.startsWith("/aprovacoes/"), allow: (c) => c.isAdmin },
  { match: (p) => p === "/insights" || p.startsWith("/insights/"), allow: (c) => c.isAdmin },
];

export function canAccess(pathname: string, caps: Caps): boolean {
  const rule = RULES.find((r) => r.match(pathname));
  if (!rule) return true;
  return rule.allow(caps);
}

/** Rota "home" da role (para onde redirecionar quando a rota atual é proibida). */
export function homeRouteFor(caps: Caps): string {
  if (caps.isAdmin) return "/";
  if (caps.isGerente) return "/equipe";
  if (caps.isFinanceiro) return "/financeiro";
  if (caps.isCorretor) return "/comissoes";
  return "/login";
}
