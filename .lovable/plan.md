## Funcionalidade: Distrato

Adicionar fluxo de distrato (cancelamento de contrato) que reverte adiantamentos/comissões já pagos ao corretor.

### 1. Banco de dados (nova tabela `distratos`)

Campos principais:
- `sale_id` (referência à venda)
- `corretor_user_id`
- `valor_devolver` (soma dos pedidos pagos da venda)
- `motivo`, `observacao`
- `status`: `pendente_devolucao` | `devolvido` | `cancelado`
- `created_by` (financeiro que registrou), `created_at`
- `devolvido_at`, `confirmado_por`

RLS:
- Financeiro/admin: full
- Corretor: SELECT dos próprios

Ao criar distrato: marcar `commission_requests` pagos da venda como `distratado` (novo status) — para sumir do "a receber" e aparecer na lista de devolução.

### 2. Backend — `src/lib/distratos.functions.ts`

- `createDistrato({ sale_id, motivo })` — financeiro/admin. Calcula soma de tudo já pago (adiantamento + final), cria registro, marca pedidos pagos como `distratado`.
- `listDistratos({ status?, corretor_user_id?, from?, to? })` — financeiro vê todos; corretor vê só os seus.
- `markDistratoDevolvido({ id, observacao })` — financeiro confirma que valor foi devolvido pelo corretor.
- `cancelDistrato({ id })` — admin, reverte (volta pedidos para `pago`).

### 3. UI Financeiro (`/financeiro`)

- **Botão vermelho "Distrato"** ao lado de cada linha em pedidos `pago` (ou na linha da venda). Abre dialog com motivo e mostra valor total a devolver.
- **Novo bloco "Distratos"** com:
  - KPIs: total a devolver, total devolvido, qtd distratos
  - Filtros: corretor (select), período (data início/fim), status
  - Tabela: data, cliente, empreendimento, corretor, valor, status, ação "Marcar devolvido"

### 4. UI Corretor (no dashboard `/` ou nova aba)

- **Bloco "Distratos"** quando existirem distratos do corretor:
  - Lista: cliente, empreendimento, valor a devolver à empresa, status
  - Aviso destacado em vermelho com total a devolver

### Arquivos a criar/editar

- **Migration**: nova tabela `distratos` + novo enum `distrato_status` + adicionar `'distratado'` ao enum `request_status`
- **Criar**: `src/lib/distratos.functions.ts`
- **Criar**: `src/components/distratos/DistratoButton.tsx` (dialog do botão vermelho)
- **Criar**: `src/components/distratos/DistratosPanel.tsx` (bloco financeiro)
- **Criar**: `src/components/distratos/DistratosCorretor.tsx` (bloco corretor)
- **Editar**: `src/routes/_authenticated/financeiro.tsx` — botão + painel
- **Editar**: `src/routes/_authenticated/index.tsx` — bloco corretor

### Confirmar antes de implementar

1. O distrato deve **bloquear novos pedidos** dessa venda? (recomendo sim)
2. O botão vermelho deve aparecer em **toda venda já paga** ou só na lista de pedidos pagos da tela `/financeiro`?
3. Distrato gera devolução do **valor total já pago** (adiantamento + comissão final somados) ou financeiro define o valor manualmente?