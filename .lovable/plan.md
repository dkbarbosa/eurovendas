## Visão geral

Plataforma web premium (dark mode enterprise) para análise comercial da construtora — Equipe Maicon. Lê os dados ao vivo do Google Sheets equivalente à planilha enviada, com login protegido, cadastro de usuários pelo admin e insights automáticos calculados.

## Stack

- TanStack Start + React + Tailwind v4 + Framer Motion (animações).
- shadcn/ui para componentes, Recharts para gráficos.
- Lovable Cloud (Postgres + Auth + Server Functions) para login, papéis e cache de dados.
- Conector Google Sheets para sincronizar a planilha.

## Fonte de dados — Google Sheets

1. Você migra a planilha atual para o Google Sheets (mesmas abas: Dashboard, Config, Equipe Maicon, Resumo Equipe, Gerente Geral).
2. Cole a URL do Sheets no painel admin do app.
3. Conectamos via conector Google Sheets (OAuth) e lemos a aba **Equipe Maicon** como fonte primária + **Config** para taxas de comissão e listas (corretores, gerentes, empreendimentos, status).
4. Server function lê o Sheets, normaliza linhas e popula uma tabela `sales` no Postgres (com `last_synced_at`).
5. Refetch automático a cada 60s + botão "Sincronizar agora". Edições no Sheets aparecem em < 1 min.

## Autenticação e papéis

- Lovable Cloud Auth (e-mail/senha).
- Tabela `user_roles` (enum `admin`, `diretor`, `gerente`, `corretor`) — função `has_role()` com SECURITY DEFINER.
- Primeiro usuário cadastrado vira admin automaticamente; demais são criados pelo admin em `/admin/usuarios`.
- `_authenticated` layout protege todas as rotas; `/admin/*` exige role admin.
- Tela de login premium (card central, glassmorphism, fundo grafite com gradient).

## Estrutura de páginas

- `/login` — login premium.
- `/` (protegido) — Dashboard executivo.
- `/vendas` — tabela analítica com busca, ordenação, filtros, exportação Excel/PDF.
- `/corretores` — ranking + perfil de cada corretor.
- `/gerentes` — performance dos gerentes.
- `/empreendimentos` — análise por empreendimento.
- `/insights` — feed de insights automáticos e alertas.
- `/admin/usuarios` — CRUD de usuários (admin).
- `/admin/integracao` — URL do Sheets, status de sync, botão sincronizar.

## KPIs no dashboard

Cards premium animados: VGV total, total de vendas, ticket médio, comissão bruta, comissão líquida, melhor corretor, melhor gerente, melhor empreendimento, crescimento mensal %, meta atingida (vs Meta VGV/Meta Comissões da aba Config), conversão, média por corretor, vendas do mês, vendas da semana, performance da equipe.

## Gráficos (Recharts + Framer Motion)

1. VGV por mês — linha animada com gradiente.
2. Ranking de corretores — barras horizontais.
3. Vendas por empreendimento — donut.
4. Evolução mensal — area chart com gradient.
5. Comissão por corretor — barras.
6. Meta vs realizado — gauge (radial bar).
7. Heatmap de performance (corretor × mês).
8. Funil comercial (Reservado → Vendido → Liberado → Pago, com Distrato em destaque).
9. Crescimento mensal % — barras com cor condicional.
10. Comparativo entre gerentes — barras agrupadas.

## Filtros globais

Barra sticky no topo com: data início/fim, empreendimento, corretor, gerente, Coaphar (Sim/Não), status, faixa de valor, mês, ano. Estado em URL search params (compartilhável). Aplica a TODOS os gráficos e à tabela.

## Tabela analítica (`/vendas`)

TanStack Table — busca global, ordenação por coluna, paginação, colunas mostráveis/ocultáveis, scroll virtual, badges de status coloridos, exportação para `.xlsx` (SheetJS) e `.pdf` (jsPDF + autotable).

## Insights automáticos (sem chat de IA)

Cards calculados server-side a cada sync:
- "Corretor que mais vendeu no mês" + variação vs mês anterior.
- "Empreendimento com maior crescimento".
- "Gerente com melhor conversão".
- "Mês com maior VGV".
- Alertas: queda > 20% mês a mês, meta em risco (< 80% no dia 25), corretor sem venda há 30 dias, distrato acima da média.

## Visual / Design tokens (`src/styles.css`)

- Fundo grafite `oklch(0.18 0.01 265)`, surface `oklch(0.22 0.012 265)`.
- Primary teal `#15CAB6`, secondary blue `#007FFF`, accent gold `#F6B53D` (paleta da aba Config da planilha).
- Tipografia: Inter Tight (display) + Inter (corpo).
- Cards com border sutil, `backdrop-blur`, glow no hover, sombras layered.
- Micro animações Framer Motion em entrada de cards, contadores animados nos KPIs.

## Detalhes técnicos

- **Server functions** (`src/lib/sheets.functions.ts`, `sales.functions.ts`, `insights.functions.ts`) com `requireSupabaseAuth`.
- **Sync**: `syncFromSheets()` lê via gateway `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}/values/Equipe%20Maicon!A:U`, faz upsert em `sales` por chave (Data + Unidade + Comprador).
- **Cálculos derivados** quando ausentes: Comissão Bruta = Valor × % Corr. (default 1.6% da Config); Comissão Gerente = Valor × 0.7%; Geral = 0.4%.
- **Tabelas**: `sales`, `config_kv` (metas, taxas), `app_users` (perfil), `user_roles`, `sync_log`.
- **RLS**: leitura para todos autenticados; escrita só admin; `user_roles` apenas admin.
- TanStack Query com `defaultPreloadStaleTime: 0`, refetch a cada 60s nas queries de dados.

## Etapas de entrega

1. Habilitar Lovable Cloud + criar schema (`sales`, `config_kv`, `user_roles`, `sync_log`) e RLS.
2. Conectar Google Sheets e implementar `syncFromSheets()` + página `/admin/integracao`.
3. Auth (login, layout `_authenticated`, primeiro-usuário-vira-admin) + `/admin/usuarios`.
4. Design system premium (tokens, fontes, animações base) e shell do app (sidebar + topbar + filtros globais).
5. Dashboard com KPIs + 10 gráficos.
6. Tabela analítica com exportação.
7. Páginas de drill-down (corretores, gerentes, empreendimentos).
8. Engine de insights automáticos + página `/insights`.
9. Polimento responsivo (mobile/tablet) e revisão visual final.

## O que preciso de você depois da aprovação

- URL do Google Sheets (após você migrar o .xlsx para o Sheets).
- E-mail que será o admin inicial.
