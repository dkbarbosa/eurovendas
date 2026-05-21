
# Plano: Módulo Comissões, Adiantamentos e Nota Fiscal

## 1. Visão geral do fluxo

```text
┌──────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   CORRETOR   │        │    FINANCEIRO    │        │  GOOGLE SHEETS   │
├──────────────┤        ├──────────────────┤        ├──────────────────┤
│ Vê SUAS      │        │ Fila de pedidos  │        │ Fonte da verdade │
│ vendas       │        │ (adiant. + NF)   │        │ p/ vendas        │
│ Solicita     │──────▶ │ Aprova / Nega    │        │ (sync existente) │
│ adiantamento │        │ (motivo obrig.)  │        │                  │
│ Recebe sol.  │◀────── │ Solicita NF ao   │        │                  │
│ de NF        │        │ corretor         │        │                  │
└──────────────┘        └──────────────────┘        └──────────────────┘
```

Três personas:
- **Corretor** (`user`) — vê só o que é dele, solicita adiantamento, marca NF como emitida.
- **Financeiro** (`financeiro` — role nova) — vê fila de pedidos, aprova/nega, dispara pedido de NF.
- **Admin** — vê tudo (já existe).

---

## 2. Banco de dados (4 tabelas novas + 1 enum atualizado)

### 2.1 Atualizar enum de roles
```sql
ALTER TYPE app_role ADD VALUE 'financeiro';
```

### 2.2 `broker_mapping` — liga usuário ↔ nome do corretor na planilha
| campo | tipo | obs |
|---|---|---|
| user_id | uuid (FK profiles) | PK |
| corretor_nome | text | mesmo string que aparece em `sales.corretor` |
| ativo | boolean | default true |

**Por quê:** Sem isso, o corretor logado não consegue ser ligado às linhas da planilha (nome é texto livre). Admin cadastra na tela de Usuários.

### 2.3 `commission_requests` — solicitações de adiantamento
| campo | tipo | obs |
|---|---|---|
| id | uuid | PK |
| corretor_user_id | uuid | quem pediu |
| sale_id | uuid (FK sales) | venda vinculada |
| tipo | enum(`adiantamento`,`comissao_final`) | |
| valor_sinal | numeric | informado manualmente |
| bonus_corretor | numeric | informado manualmente (novo) |
| valor_solicitado | numeric | calculado/editável |
| observacao_corretor | text | caixa obrigatória |
| status | enum(`pendente`,`aprovado`,`negado`,`pago`) | |
| motivo_negacao | text | obrigatório se status=negado |
| observacao_financeiro | text | opcional |
| aprovado_por | uuid | |
| created_at / updated_at / decided_at | timestamptz | |

### 2.4 `nf_requests` — fluxo de Nota Fiscal
| campo | tipo | obs |
|---|---|---|
| id | uuid | PK |
| sale_id | uuid (FK sales) | |
| corretor_user_id | uuid | a quem foi solicitada |
| solicitado_por | uuid | financeiro |
| status | enum(`solicitada`,`emitida`,`recebida`,`cancelada`) | |
| numero_nf | text | preenchido pelo corretor |
| arquivo_nf_url | text | upload opcional (storage) |
| observacao_financeiro | text | ao solicitar |
| observacao_corretor | text | ao emitir |
| created_at / emitida_at / recebida_at | timestamptz | |

### 2.5 `request_audit_log` — auditoria (defesa contra bug/disputa)
Append-only: `entity_type`, `entity_id`, `action`, `actor_id`, `payload jsonb`, `created_at`.

### 2.6 RLS (padrão crítico)
- Função `is_financeiro(uuid)` security definer (igual `is_admin`).
- `commission_requests`:
  - SELECT: dono OR financeiro OR admin
  - INSERT: dono (com `corretor_user_id = auth.uid()`)
  - UPDATE: só financeiro/admin (mudar status); dono só enquanto `pendente`
- `nf_requests`:
  - SELECT: dono OR financeiro OR admin
  - INSERT: só financeiro/admin
  - UPDATE: dono (campos de emissão) OR financeiro (status final)
- `broker_mapping`: SELECT autenticado; write só admin.
- `sales` continua como está, mas leitura do corretor é filtrada via server function (não via RLS, para evitar regressão na Dashboard atual).

---

## 3. Backend (TanStack Server Functions)

Tudo em `src/lib/*.functions.ts` com `requireSupabaseAuth`. Nenhum Edge Function.

### 3.1 `commissions.functions.ts`
- `getMyCommissions()` — vendas do corretor logado (via `broker_mapping`), agregadas por mês, com totais bruto/líquido/recebido/a receber.
- `getBrokerDashboard(userId?)` — admin/financeiro pode ver de qualquer corretor.

### 3.2 `requests.functions.ts`
- `createAdvanceRequest(input)` — valida com Zod (valor_sinal ≥ 0, bonus ≥ 0, observação opcional mas texto livre permitido, sale_id pertence ao corretor).
- `listRequests(filters)` — fila para financeiro (status, periodo, corretor).
- `decideRequest({id, decision, motivo, observacao})` — `motivo` obrigatório se `negado`; transição de estado validada (não pode aprovar já decidido).
- `markAsPaid(id)` — só financeiro.

### 3.3 `nf.functions.ts`
- `requestNF({sale_id, observacao})` — só financeiro; cria registro `solicitada`.
- `markNFEmitted({id, numero_nf, observacao, arquivo_url?})` — só dono; valida `numero_nf` não vazio.
- `confirmNFReceived(id)` — só financeiro.
- `listMyNFRequests()` / `listNFQueue()`.

### 3.4 Regras de negócio centralizadas (`src/lib/requests-rules.ts`)
- Máximo de adiantamento pendente por venda = 1 (evita duplicidade).
- Valor solicitado ≤ `comissao_liq_corretor` da venda (warning, não bloqueio — financeiro decide).
- Transições de estado em máquina de estado pura e testável.

---

## 4. Frontend (4 telas novas + ajustes)

### 4.1 Menu — adicionar 2 itens
- **Comissões** (todos os autenticados — conteúdo varia por role)
- **Financeiro** (só `financeiro` e `admin`)

### 4.2 `/comissoes` (corretor)
- KPIs: total vendido (mês/ano), comissão líquida prevista, recebida, a receber, pendente de NF.
- Gráfico de barras (mensal) — comissões previstas vs recebidas.
- Tabela das suas vendas com colunas: data, cliente, valor, comissão líq, status NF, ações (`Solicitar adiantamento`, `Emitir NF` quando solicitada).
- Modal **Solicitar adiantamento**: select de venda → valor_sinal, bonus, valor solicitado, **observação (textarea sempre presente)**.
- Modal **Emitir NF**: número da NF, upload opcional, **observação**.

### 4.3 `/comissoes` (admin/financeiro)
Mesma tela com seletor `Corretor: [todos | João | …]`.

### 4.4 `/financeiro` (financeiro/admin)
- Tabs: **Adiantamentos** | **Notas Fiscais** | **Histórico**.
- Tab Adiantamentos: fila ordenada por data; ações Aprovar / Negar (modal exige motivo) / Pagar.
- Tab Notas Fiscais: lista de vendas elegíveis (`status` de venda = quitado/aprovado) com botão **Solicitar NF ao corretor** → modal com **observação**. Lista das NF em aberto com status.
- Filtros: período, corretor, status, busca por cliente.

### 4.5 Ajuste em `/admin/usuarios`
- Coluna **Corretor (planilha)** com select populado a partir dos nomes distintos de `sales.corretor` + opção "Adicionar manualmente".
- Coluna **Role** já existe — adicionar opção `financeiro`.

### 4.6 Realtime
- Habilitar realtime em `commission_requests` e `nf_requests`.
- Corretor vê status mudar sem refresh; financeiro vê novos pedidos chegando.

---

## 5. Mapa de bugs previstos e mitigações

| # | Risco | Mitigação |
|---|---|---|
| 1 | Corretor não consegue ver vendas (nome não bate) | Tabela `broker_mapping` + tela admin obrigatória; warning na UI "Seu usuário não está vinculado a um corretor — contate admin" |
| 2 | Duplo clique cria 2 pedidos | Botão com `loading` + constraint UNIQUE `(sale_id, status)` parcial onde `status='pendente'` |
| 3 | Race condition na aprovação (2 financeiros aprovam ao mesmo tempo) | UPDATE com `WHERE status='pendente'` retorna 0 linhas → erro amigável |
| 4 | Sync do Sheets sobrescreve `sales` e quebra FK de pedidos | FK `ON DELETE RESTRICT` + sync usa upsert por `row_hash`, não delete-insert |
| 5 | Valor solicitado > comissão real | Warning na UI + log; financeiro decide |
| 6 | Observação esquecida ao negar | Validação Zod no server + form no client |
| 7 | RLS escapando dados de outro corretor | Testes manuais com 2 contas + policy `USING (corretor_user_id = auth.uid() OR is_financeiro(auth.uid()) OR is_admin(auth.uid()))` |
| 8 | Recursão infinita em RLS | Função `is_financeiro` security definer (mesmo padrão de `is_admin`) |
| 9 | Bug de fuso horário em "mês" | Padronizar `America/Sao_Paulo` em todas agregações server-side |
| 10 | Sessão expirar no meio da solicitação | Bearer attacher já existe; toast de "sessão expirada, faça login" |
| 11 | Solicitação aprovada some quando admin paga | Status `pago` mantido em "Histórico", não removido |
| 12 | Auditoria perdida | `request_audit_log` em trigger AFTER UPDATE/INSERT |
| 13 | Tipo `numeric` virar string no JS | Server function converte explicitamente `Number()` antes de retornar |
| 14 | NF emitida mas financeiro nunca confirma | Card "NF aguardando confirmação > 7 dias" no dashboard financeiro |
| 15 | Bônus negativo / valor absurdo | Zod: `valor_sinal: z.number().min(0).max(10_000_000)` |

---

## 6. Ordem de implementação (entregas testáveis)

1. **Migration** (todas as tabelas + enum + funções + RLS + audit trigger).
2. **`broker_mapping`** + UI em `/admin/usuarios` — sem isso nada funciona.
3. **`commissions.functions.ts`** + tela `/comissoes` modo corretor (read-only).
4. **Fluxo de adiantamento** completo (server + modal + tela financeiro).
5. **Fluxo de NF** completo.
6. **Realtime** + notificações toast.
7. **Auditoria + filtros de histórico**.
8. **QA com 3 contas** (admin, financeiro, corretor).

---

## 7. O que NÃO vai entrar (escopo controlado)

- Pagamento real / integração bancária.
- Emissão automática de NF via API da prefeitura (só registro manual).
- App mobile nativo.
- Notificação por email/WhatsApp (pode ser fase 2).

---

## 8. Resposta direta às suas dúvidas

- **Bônus manual no momento do pedido** ✅ campo `bonus_corretor` em `commission_requests`, editável tanto em adiantamento quanto comissão final.
- **Financeiro solicita "Emitir NF"** ✅ tabela `nf_requests` + tab dedicada; corretor recebe na tela `/comissoes` com botão de ação.
- **Caixa de observação em todo envio/pedido** ✅ presente em: criar adiantamento (corretor), aprovar/negar (financeiro), solicitar NF (financeiro), emitir NF (corretor), confirmar NF (financeiro). Todas as observações ficam no histórico/auditoria.

Sistema fica leve (4 tabelas, ~6 server functions, 2 telas novas). Risco principal é o mapeamento corretor↔usuário — por isso é a etapa #2.
