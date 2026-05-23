## Devolução por Distrato com Desconto em Comissões Futuras

Hoje o distrato apenas marca pedidos pagos como `distratado` e registra valor a devolver. Vamos adicionar o ciclo completo: pendência financeira → vincular desconto em novo pedido → abater do valor pago → controlar saldo restante.

### 1. Banco de dados (nova migration)

**Nova tabela `distrato_descontos`** (cada aplicação de desconto vinculada a um pedido de comissão):
- `distrato_id` (FK lógica → distratos)
- `commission_request_id` (FK lógica → commission_requests — pedido onde o desconto foi aplicado)
- `valor_desconto` numeric
- `aplicado_por` uuid, `aplicado_at` timestamptz
- `status`: `aplicado` | `estornado`
- `observacao` text

**Alterações em `distratos`**:
- `valor_devolvido` numeric default 0 (soma dos descontos aplicados + devoluções diretas)
- `saldo_restante` (calculado em queries: `valor_devolver - valor_devolvido`)
- adicionar status `quitado_por_desconto` ao enum `distrato_status`

**Alterações em `commission_requests`** (apenas para visualização rápida):
- `desconto_distrato` numeric default 0 (soma dos descontos vinculados, refletido ao aprovar/pagar)

RLS: financeiro/admin gerencia; corretor vê os seus.

### 2. Backend — `src/lib/distratos.functions.ts`

Adicionar:
- `listPendenciasDistrato({ corretor_user_id? })` — retorna distratos com `saldo_restante > 0`. Financeiro vê todos; corretor vê os seus.
- `aplicarDescontoDistrato({ distrato_id, commission_request_id, valor_desconto, observacao? })` — financeiro/admin. Valida: pedido `aprovado` (ainda não pago) e do mesmo corretor; valor ≤ saldo restante; valor ≤ valor_solicitado do pedido. Insere `distrato_descontos`, soma em `commission_requests.desconto_distrato`, soma em `distratos.valor_devolvido`. Se `valor_devolvido >= valor_devolver`, marca distrato como `quitado_por_desconto`.
- `estornarDescontoDistrato({ id })` — admin/financeiro. Marca desconto como `estornado`, decrementa contadores, volta distrato para `pendente_devolucao` se aplicável.
- `listDescontosByRequest({ commission_request_id })` — lista descontos aplicados em um pedido.

Ajuste em `markDistratoDevolvido` para somar em `valor_devolvido` quando devolução em dinheiro.

### 3. UI Financeiro

**Em `/financeiro` — no card de cada pedido `aprovado`**:
- Se corretor tem pendências de distrato, mostrar botão **"Vincular desconto"** (roxo/destrutivo suave).
- Dialog: lista pendências do corretor (cliente, valor a devolver, saldo restante) + input valor desconto + observação. Permite múltiplos descontos no mesmo pedido.
- Linha do pedido passa a exibir: `Valor: R$ 3.500 − Desconto distrato: R$ 1.000 = Líquido: R$ 2.500`.
- Ao confirmar pagamento, valor pago = `valor_solicitado - desconto_distrato`.

**Em `/distratos` (DistratosPanel)**:
- Nova coluna "Saldo restante" e "Devolvido".
- Sub-bloco expansível mostrando descontos aplicados (data, pedido, valor, financeiro responsável, botão estornar).
- KPI extra: "Saldo a recuperar" (soma de saldos restantes).

### 4. UI Corretor

**Em `/comissoes` (visão do corretor)**:
- Bloco vermelho "Pendências de devolução por distrato" listando: cliente, valor original, devolvido, saldo restante.
- Em cada pedido `aprovado`, se houver desconto vinculado: mostrar "Desconto aplicado: R$ X.XXX — Distrato cliente João Silva".

### Detalhes técnicos

- Tabela `distrato_descontos` usa FK lógica (sem ON DELETE CASCADE — preservar histórico).
- Pagamento: o `markPago` (em requests.functions.ts) precisa registrar `valor_pago_liquido = valor_solicitado - desconto_distrato` em log/auditoria. O fluxo de transferência continua sendo do financeiro, só ajustamos a exibição e cálculos.
- Estorno do distrato (`cancelDistrato`/`deleteDistrato`): também estornar descontos vinculados.
- KPIs de `/comissoes` (`Recebidos`, `Adiantamentos`) precisam descontar valores estornados/distratados para refletir a realidade.

### Arquivos

- **Migration**: criar `distrato_descontos`, adicionar colunas em `distratos` e `commission_requests`, novo valor enum.
- **Editar**: `src/lib/distratos.functions.ts` — novas funções e ajustes em delete/cancel.
- **Criar**: `src/components/distratos/AplicarDescontoButton.tsx`
- **Editar**: `src/components/distratos/DistratosPanel.tsx` — saldo, descontos aplicados, estorno.
- **Editar**: `src/routes/_authenticated/financeiro.tsx` — botão "Vincular desconto" nas linhas `aprovado` + exibição valor líquido.
- **Editar**: `src/routes/_authenticated/comissoes.tsx` — bloco pendências do corretor + exibição desconto nos pedidos.

### Confirmar antes de implementar

1. O desconto pode ser aplicado em pedido **`aprovado` (ainda não pago)** apenas, ou também em pedidos `pendente`? (recomendo apenas `aprovado` — momento natural antes do pagamento).
2. Se o pedido onde o desconto está vinculado for **negado/cancelado** depois, o desconto deve ser **estornado automaticamente** (saldo volta para o distrato)? (recomendo sim).
3. Permitir **devolução em dinheiro parcial** (corretor paga parte e o restante vira desconto)? (atualmente `markDistratoDevolvido` quita 100% — ajustar para aceitar valor parcial).
