
# RBAC — remover "diretor" e isolar cada papel

## Matriz de acesso final

| Área / Rota | admin | gerente | corretor | financeiro |
|---|---|---|---|---|
| `/` Dashboard | ✓ tudo | ✓ filtrado no time | ✗ | ✗ |
| `/vendas` | ✓ tudo | ✓ só do time | ✗ | ✗ |
| `/agendamentos` | ✓ | ✓ | ✗ | ✗ |
| `/corretores` | ✓ | ✓ só do time | ✗ | ✗ |
| `/gerentes` | ✓ | ✗ | ✗ | ✗ |
| `/empreendimentos` | ✓ | ✓ | ✗ | ✗ |
| `/aprovacoes` | ✓ | ✓ time | ✗ | ✗ |
| `/insights` | ✓ | ✓ time | ✗ | ✗ |
| `/comissoes` | ✓ | ✓ próprias | ✓ próprias | ✗ |
| `/financeiro` (aprovar/negar/solicitar) | ✓ | ✗ | ✗ | ✓ |
| `/distratos` | ✓ | ✗ | ✗ | ✓ |
| `/admin/*` | ✓ | ✗ | ✗ | ✗ |

Financeiro fica 100% isolado da área comercial (não vê dashboard, vendas, gerentes, corretores, agendamentos, insights, empreendimentos, comissões de outros).

## Mapeamento de time para gerente

A tabela `broker_mapping` hoje mapeia user → `corretor_nome`. Para o gerente enxergar o time, vou adicionar uma coluna `gerente_nome` (text, nullable) na mesma tabela. Regra:
- Se `gerente_nome` preenchido **e** o usuário tem role `gerente` → ele vê `sales WHERE gerente = gerente_nome` (case-insensitive, trim) — mesma lógica usada hoje para corretor.
- Mesma row pode ter `corretor_nome` e `gerente_nome` (admin que também atua).
- Tela `/admin/usuarios` ganha campo para amarrar o gerente ao nome dele na planilha.

## Mudanças no banco (migration)

1. Revogar todos os `user_roles` com `role='diretor'` (move pra `gerente` por padrão — admin pode reajustar depois).
2. **Não removo o valor do enum** (`app_role`) porque PostgreSQL não suporta DROP VALUE em enum em uso histórico; deixo `diretor` no enum mas sem nenhum efeito prático no app (nenhum policy/função referencia mais). Linter não acusa.
3. Reescrever policy `sales select own or staff` removendo `has_role(diretor)` e adicionando ramo gerente (sales.gerente = bm.gerente_nome).
4. Adicionar coluna `broker_mapping.gerente_nome text`.
5. Funções `app_private.is_admin` / `is_financeiro` permanecem; criar `app_private.is_gerente(uid)` e helper `app_private.gerente_nome_of(uid)`.

## Frontend

- `src/lib/auth.tsx`:
  - Remover `isDiretor` e `isStaff` (conceito morto). Introduzir capabilities semânticas: `canManagement` (admin OR gerente), `canFinanceiro` (admin OR financeiro), `canAdmin` (admin), `canCorretor` (admin OR corretor OR gerente para próprias comissões).
  - `corretorNome` continua; adicionar `gerenteNome` vindo de `getCurrentUserContext`.
- `src/lib/auth.functions.ts`: retornar `gerenteNome` junto.
- `src/components/AppShell.tsx`: reescrever blocos da sidebar conforme matriz. Financeiro vê apenas Painel Financeiro. Admin vê tudo. Gerente vê Gestão (sem `/gerentes`) + suas comissões. Corretor vê só Comissões.
- Adicionar `beforeLoad` em cada route (`/vendas`, `/agendamentos`, `/corretores`, `/gerentes`, `/empreendimentos`, `/aprovacoes`, `/insights`, `/financeiro`, `/distratos`, `/admin/*`, `/comissoes`, `/`) que verifica a capability — se reprova, redireciona pra rota permitida do usuário (financeiro → `/financeiro`, corretor → `/comissoes`, gerente → `/`, sem role → `/login`).
- Telas que já checam role (financeiro.tsx, comissoes.tsx, admin/*) — substituir `isStaff/isDiretor` pelas novas capabilities; em `comissoes.tsx` o gerente cai no mesmo fluxo do corretor (vê só as próprias).
- `/admin/usuarios`: remover "diretor" da lista de roles atribuíveis; adicionar campo `gerente_nome` no mapeamento.

## Backend (server functions)

- `commissions.functions.ts` linha 44: tirar `diretor` do `isStaff`. Gerente NÃO é staff aqui — vê só dele.
- `requests.functions.ts`, `nf.functions.ts`, `distratos.functions.ts`: mantêm staff = admin OR financeiro (já estava assim na maior parte). Garantir que gerente é tratado como "corretor comum" para comissões dele.
- `sales.functions.ts` (caminho de listagem): adicionar branch gerente (filtra por `sales.gerente = gerenteNome`).
- `agendamentos.functions.ts`: liberar para gerente.
- Bloquear financeiro em todas as listagens comerciais (sales, agendamentos, insights, etc.) — adicionar assert no início.

## Garantias

- Sem role válido → redireciona pra `/login` (já existe).
- Cada rota tem duplo gate: `beforeLoad` no router + checagem no server function (defense-in-depth).
- RLS no banco continua sendo a backstop final.
- Nenhuma regra de negócio existente é alterada: cálculos de comissão, sync Sheets, Drive, NF, distrato, auditoria — tudo intacto. Só muda **quem enxerga o quê**.

## Etapas de execução (na ordem)

1. Migration: revogar roles diretor → gerente, adicionar `broker_mapping.gerente_nome`, criar `is_gerente`/`gerente_nome_of`, atualizar policy `sales`.
2. Backend: `auth.functions.ts`, `commissions/sales/agendamentos/requests/nf/distratos.functions.ts`.
3. `src/lib/auth.tsx` — novas capabilities.
4. `AppShell` — sidebar nova.
5. `beforeLoad` em cada route file.
6. Telas: comissoes.tsx, financeiro.tsx, admin/usuarios.tsx — substituir checks.
7. Smoke test mental: para cada role, listar rotas visíveis e confirmar matriz.

## Pontos que preciso confirmar

- **OK migrar diretores existentes para `gerente` automaticamente?** Alternativa: deixar sem role (vão cair no /login). Recomendo migrar pra gerente — admin reajusta depois se quiser.
- **Gerente vê `/aprovacoes` e `/insights` do time?** Plano diz sim. Se preferir só admin, removo.
