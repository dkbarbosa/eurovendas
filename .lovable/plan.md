
# Painel do Gerente — Plano de Implementação

## Resumo
Construir uma página `/gerentes` rica para o Gerente (e também acessível ao Admin com seletor de gerente), centralizando vendas da equipe, comissão própria, solicitações, distratos e métricas. Reaproveita as colunas já existentes na tabela `sales` (`comissao_liq_gerente`, `adiant_gerente`, `bonus_gerente`, `pct_gerente`, `gerente`) que já são populadas pelo sync com o Sheets.

A sidebar atual fica preservada (decisão do usuário: itens separados). A entrada **Gerentes** passa a ser visível também para o gerente e vira a "casa" dele, com tudo organizado em abas.

## Etapa 1 — Banco de dados (migration)

**`commission_requests`** — habilitar pedidos do gerente:
- `requester_role text` not null default `'corretor'` (valores: `corretor` | `gerente`)
- `gerente_user_id uuid` nullable
- Índices: `(gerente_user_id)`, `(requester_role)`
- Atualizar RLS:
  - INSERT: permite gerente inserir com `requester_role='gerente'` e `gerente_user_id=auth.uid()`
  - SELECT: gerente vê os próprios + corretor já vê os dele + staff vê tudo

**`distratos`** — refletir impacto no gerente:
- `gerente_user_id uuid` nullable
- `gerente_nome text` nullable
- `valor_comissao_gerente numeric` default 0 (snapshot da comissão líquida do gerente naquela venda)
- RLS SELECT acrescenta cláusula: `gerente_user_id = auth.uid()`

**`distrato_descontos`** — permitir desconto em pedido do gerente:
- `gerente_user_id uuid` nullable (alternativa a `corretor_user_id`)
- SELECT: ou corretor_user_id=auth.uid() ou gerente_user_id=auth.uid() ou staff

## Etapa 2 — Server functions novas (`src/lib/gerente.functions.ts`)

- `getGerenteOverview({ from?, to?, gerente_nome? admin })` → retorna:
  - `gerenteNome`, KPIs agregados (VGV equipe, nº vendas, comissão bruta/líquida gerente, adiantado, a receber, em andamento, distratos)
  - Série mensal (vendas + comissão gerente)
  - Breakdown por corretor da equipe (vendas, VGV, comissão corretor, comissão gerente)
  - Lista de vendas (com saldo a receber por gerente)
  - Lista de requests do gerente (`requester_role='gerente'`)
  - Lista de distratos que impactam o gerente
- `createGerenteCommissionRequest({ sale_id, tipo, valor_solicitado, observacao })` — replica regras do corretor mas usando `comissao_liq_gerente` como base e gravando `requester_role='gerente'`, `gerente_user_id=auth.uid()`.
- Ajustar `aplicarDescontoDistrato` em `distratos.functions.ts` para aceitar pedido do gerente (matching por gerente_user_id em vez de corretor_user_id).
- Ajustar `createDistrato` para snapshotar `valor_comissao_gerente`, `gerente_user_id`, `gerente_nome`.
- Ajustar `listAllRequests` (financeiro) para retornar também pedidos do gerente com o profile correto.

## Etapa 3 — UI

**`src/routes/_authenticated/gerentes.tsx`** — substituir o stub por um dashboard com abas:
1. **Visão Geral** — KPI cards + gráficos (vendas/mês, comissão/mês), filtros de período.
2. **Vendas da Equipe** — tabela com filtros (corretor, cliente, empreendimento, período).
3. **Minha Comissão** — tabela das vendas onde ele é gerente, com saldo a receber e botão "Solicitar".
4. **Solicitações** — pedidos do gerente (pendente/aprovado/pago/negado) + descontos de distrato vinculados.
5. **Distratos** — distratos que impactam comissão do gerente.
6. **Equipe** — performance por corretor (ranking, comparativos), reaproveita `setTeamMember`.

Componentes: `KPICard`, `ChartCard`, recharts (já em uso), filtros com `usePersistentState`.

**`src/lib/route-access.ts`** — `/gerentes` permitido para `isAdmin || isGerente`.
**`src/components/AppShell.tsx`** — remove `adminOnly` do item Gerentes; passa a aparecer para o gerente.
**Admin** — quando admin abre `/gerentes`, exibe `<Select>` com lista de gerentes (`gerente_nome` distintos) para "impersonar" e ver dados de cada um.

**`src/routes/_authenticated/comissoes.tsx`** — sem mudança nesta fase; o gerente continua sem acesso por padrão (ele faz tudo dentro de `/gerentes`). Comissões individual dele fica na aba "Minha Comissão" do painel novo.

**Distratos para Financeiro** — `src/routes/_authenticated/distratos.tsx` (não preciso mexer) já vai exibir o snapshot novo das colunas do gerente nas próximas listagens.

## Detalhes técnicos
- Reaproveita coluna `sales.gerente` (já alimentada pela planilha) para casar com `broker_mapping.gerente_nome`.
- Comissão do gerente vem da própria planilha (`comissao_liq_gerente` calculada lá); não precisa puxar novas células do Sheets.
- Regras de adiantamento do gerente: mesma lógica do corretor (1k a cada 2999,99 de sinal; comissão final exige sinal ≥6% do VGV; CAIXA libera; RESERVADO bloqueia).
- Distratos: snapshot da comissão do gerente é feito no momento da criação (mesmo padrão que já existe para corretor), e o financeiro pode aplicar desconto contra o pedido do gerente exatamente igual ao do corretor.

## O que NÃO entra nesta fase
- Mudar visual da sidebar (decisão: manter itens separados).
- Refazer a tela `/comissoes` para o gerente — fica isolado em `/gerentes` para evitar confusão.
- Pull novo do Google Sheets (dados de gerente já estão sincronizados).

Posso iniciar a implementação?
