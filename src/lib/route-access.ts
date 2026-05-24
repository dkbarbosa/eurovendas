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

  // Comissões — admin, gerente OU corretor (cada um vê só as próprias; gerente também)
  { match: (p) => p === "/comissoes" || p.startsWith("/comissoes/"), allow: (c) => c.isAdmin || c.isGerente || c.isCorretor },

  // Minha Equipe — admin OU gerente
  { match: (p) => p === "/equipe" || p.startsWith("/equipe/"), allow: (c) => c.isAdmin || c.isGerente },

  // Gerentes (cadastro/lista) — só admin
  { match: (p) => p === "/gerentes" || p.startsWith("/gerentes/"), allow: (c) => c.isAdmin },

  // Área comercial (dashboard, vendas, agendamentos, corretores, empreendimentos,
  // aprovações, insights) — admin OU gerente
  { match: (p) => p === "/", allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/vendas" || p.startsWith("/vendas/"), allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/agendamentos" || p.startsWith("/agendamentos/"), allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/corretores" || p.startsWith("/corretores/"), allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/empreendimentos" || p.startsWith("/empreendimentos/"), allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/aprovacoes" || p.startsWith("/aprovacoes/"), allow: (c) => c.isAdmin || c.isGerente },
  { match: (p) => p === "/insights" || p.startsWith("/insights/"), allow: (c) => c.isAdmin || c.isGerente },
];

export function canAccess(pathname: string, caps: Caps): boolean {
  const rule = RULES.find((r) => r.match(pathname));
  if (!rule) return true; // rota não mapeada → permite (ex.: /login não passa por aqui)
  return rule.allow(caps);
}

/** Rota "home" da role (para onde redirecionar quando a rota atual é proibida). */
export function homeRouteFor(caps: Caps): string {
  if (caps.isAdmin) return "/";
  if (caps.isGerente) return "/";
  if (caps.isFinanceiro) return "/financeiro";
  if (caps.isCorretor) return "/comissoes";
  return "/login";
}
