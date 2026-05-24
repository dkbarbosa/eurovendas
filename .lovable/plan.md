## Plano

### 1. Banco — `nf_requests` multi-role
Adicionar suporte a NF para gerente e diretor (gestão), reaproveitando a mesma tabela `nf_requests`:

- Novas colunas:
  - `requester_role text not null default 'corretor'` (`corretor|gerente|diretor`)
  - `gerente_user_id uuid`
  - `diretor_user_id uuid`
- Tornar `corretor_user_id` nullable (já é).
- Atualizar RLS para que o "dono" da NF possa ser o corretor, gerente OU diretor:
  - SELECT/UPDATE: incluir `gerente_user_id = auth.uid()` e `diretor_user_id = auth.uid()`.
- A unicidade "uma NF ativa por venda" passa a ser **por venda + role** (corretor pode ter a sua, gerente a dele e diretor a dele — são pagamentos independentes).

### 2. `src/lib/nf.functions.ts` — generalizar
- `listEligibleSalesForNF`: além das vendas elegíveis do corretor, marcar elegibilidade para gerente (via `comissao_liq_gerente` + `broker_mapping.gerente_nome`) e para diretor (todas as vendas, com cálculo `calcComissaoDiretor`). Retornar lista única com flag `roles_disponiveis: ['corretor','gerente','diretor']` por venda.
- `requestNF`: aceitar `requester_role` no input; resolver o `user_id` correspondente (corretor pelo `broker_mapping`, gerente pelo `broker_mapping.gerente_nome`, diretor pelo único user com role `diretor`). Bloqueio "NF ativa" passa a ser por `(sale_id, requester_role)`.
- `listAllNFs`: já retorna tudo; só adicionar `requester_role` + perfil do solicitante (corretor/gerente/diretor) no payload.
- `markNFEmitted`: permitir que o dono (corretor/gerente/diretor) emita. Pasta no Drive segue `{nome do solicitante}/NF/{Empreendimento}/{Cliente}` — para gerente/diretor usar `display_name` do profile.
- `downloadNFFile`, `confirmNFReceived`, `cancelNF`, `markNFPaid`: ajustar o check de dono para `corretor_user_id OR gerente_user_id OR diretor_user_id = auth.uid()`.
- `markNFPaid` cascata: marcar como `pago` somente o `commission_requests` correspondente ao mesmo `requester_role` da NF (não derrubar o pedido do corretor quando a NF do gerente for paga).
- Distrato/desconto: manter exclusivo do fluxo corretor (gerente/diretor não têm vínculo com distrato hoje).

### 3. Painel do Financeiro (`financeiro.tsx`)
- Na seção "Solicitar NF" e "Lista de NFs", mostrar coluna **Perfil** (Corretor / Gerência / Gestão) com badge.
- No modal de solicitar NF, dropdown para escolher o perfil do destinatário entre os disponíveis para aquela venda.
- Filtro novo: por perfil do solicitante.
- Aviso "Pedido aprovado mas NF não solicitada" passa a considerar pedidos das 3 roles (`commission_requests` onde `status='aprovado'` e não há NF ativa para o mesmo `(sale_id, requester_role)`).

### 4. Painel do Gerente (`gerentes.tsx`) e Painel da Gestão (`diretor.tsx`)
Replicar a UI de "Minhas NFs" do `comissoes.tsx` (corretor):
- Lista de NFs com status (solicitada/emitida/recebida/paga/cancelada).
- Botão **Emitir NF** com modal: número, valor, upload PDF (mesmo `markNFEmitted`).
- Botão **Marcar como paga**.
- Banner "Pedido aprovado — aguardando solicitação do financeiro para NF".

### 5. Painel do Gerente — filtro de crescimento
- Em `equipe.tsx`, no card "Crescimento": adicionar opção **Mensal** ao Select, manter Trimestre/Semestre/Anual, definir **Mensal como default e selecionado por padrão**. Cálculo mensal compara VGV do mês atual vs. mês anterior.

### Detalhes técnicos
- Migração SQL com `ALTER TABLE nf_requests ADD COLUMN...` + recriação das policies SELECT/UPDATE.
- Index único parcial `(sale_id, requester_role) WHERE status IN ('solicitada','emitida','recebida')` para garantir 1 NF ativa por role.
- Manter compatibilidade: NFs existentes ficam `requester_role='corretor'` (default).
- Componente reutilizável `NFCard`/`EmitirNFDialog` em `src/components/nf/` para evitar duplicação entre os 3 painéis.

### Ordem de execução
1. Migração SQL (peço aprovação).
2. Refator `nf.functions.ts`.
3. Componentes compartilhados de NF.
4. Integrar nos painéis gerente, gestão e financeiro.
5. Filtro mensal no painel do gerente.

Confirma o plano para eu começar pela migração?
