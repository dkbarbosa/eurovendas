## Auditoria do projeto — achados e plano de correção

Fiz uma varredura de ponta a ponta (lib, rotas, hooks, integrações, logs de auth e schema do banco). Em vez de "reescrever tudo" (o que quebraria features estáveis), proponho corrigir o que realmente está falhando ou degradando hoje, em 4 frentes priorizadas.

---

### 1. Bugs reais identificados (corrigir agora)

**1.1 — Exclusão de usuário quebrada (visto nos logs de auth)**
```
ERROR: update or delete on table "profiles" violates foreign key constraint
"nf_requests_corretor_user_id_fkey" ... 500: Database error deleting user
```
As FKs `nf_requests.corretor_user_id`, `commission_requests.corretor_user_id` e `commission_requests.decided_by` apontam para `profiles` com `ON DELETE RESTRICT/NO ACTION`. Quando o admin tenta apagar um corretor que já tem solicitações, a operação falha com 500 e o usuário fica "preso".
→ Migração: trocar para `ON DELETE SET NULL` nas três FKs (preserva histórico das solicitações sem corretor), e tornar as colunas anuláveis se necessário. `broker_mapping` já está como `CASCADE` (ok).

**1.2 — `checkConnectorStatus` sem auth**
A server-fn é pública (qualquer um descobre quais conectores estão configurados). Adicionar `requireSupabaseAuth` + checagem de admin.

**1.3 — `useLiveSync` dispara para qualquer admin em qualquer rota**
Roda no AppShell mesmo em telas que não usam `sales`. Adicionar guarda: só inicia se `isAdmin` e não em `/login`. Já existe parcialmente; reforçar com cleanup do interval (hoje só roda uma vez no mount).

**1.4 — Polling não existe no `useLiveSync`**
O hook tem `INTERVAL_MS = 90_000` mas nunca usa `setInterval` — só sincroniza no mount. Ou ativamos o polling real, ou removemos a constante e renomeamos o badge para "sincronização manual". Recomendo polling real de 90s com cleanup.

---

### 2. Robustez de autenticação

**2.1 — Race condition no `auth.tsx`**
Hoje: subscribe → depois `getSession().then(...)`. Padrão correto, mas o `loading` inicial pode piscar. Adicionar `mounted` flag para evitar setState após unmount e garantir ordem determinística.

**2.2 — Token refresh silencioso**
Quando o token expira (1h), server-fns retornam 401 e a UI mostra erro genérico. Adicionar interceptor: ao receber 401 de server-fn, forçar `supabase.auth.refreshSession()` uma vez e reexecutar. Em caso de falha, redirecionar para `/login` preservando a rota.

**2.3 — `_authenticated.tsx` não revalida sessão no servidor**
Hoje só checa `context.auth.isAuthenticated` (estado do cliente). Adicionar `beforeLoad` async com `supabase.auth.getUser()` para hidratar sessão antes do loader rodar (evita 401 no primeiro paint).

---

### 3. Performance e conexões

**3.1 — `syncFromSheets` é serial e pesado**
Faz: fetch Sheets → upsert em massa → SELECT all sales → comparar → DELETE em lote. Para planilhas grandes isso é lento e mantém transação aberta. Otimizar:
- Limitar SELECT a `id,row_hash` (já faz ✓)
- Paginar upsert em chunks de 500
- Usar `Promise.all` para checagens de FK (`refsCR` e `refsNF` já são separados, paralelizar)

**3.2 — React Query sem `staleTime` razoável**
Várias queries (`sales`, `sales-all`, `commission-requests`, `nf-requests`) refazem fetch a cada foco de janela. Definir `staleTime: 30_000` no `QueryClient` default e desligar `refetchOnWindowFocus` global.

**3.3 — Bundle: imports pesados em rotas pouco usadas**
`admin/integracao.tsx` importa 10 ícones do lucide; rotas admin podem ser lazy. Verificar e aplicar `lazy()` onde fizer sentido (baixa prioridade).

**3.4 — Falta de índices no banco**
Conferir e criar índices em:
- `commission_requests(sale_id)`, `commission_requests(corretor_user_id, status)`
- `nf_requests(sale_id)`, `nf_requests(corretor_user_id, status)`
- `sales(row_hash)` (já é unique provavelmente — confirmar)

---

### 4. Limpeza e robustez geral

- Padronizar tratamento de erro em todas as server-fns (helper `toErrorMessage` já existe em `sheets.functions.ts`; extrair para `lib/errors.ts` e reutilizar).
- Remover `console.error` ruidosos em produção (manter só os críticos).
- Adicionar `try/finally` em todas as mutations que escrevem em `sync_log` para garantir que `running` seja sempre fechado.

---

### Ordem de execução proposta

1. **Migração SQL** — FKs `SET NULL` + índices faltantes (resolve o bug de deletar usuário).
2. **Auth hardening** — race em `auth.tsx`, `beforeLoad` em `_authenticated`, retry em 401.
3. **`useLiveSync`** — polling real + guarda de rota + cleanup.
4. **React Query defaults** — staleTime + refetchOnWindowFocus.
5. **`syncFromSheets`** — chunks + paralelismo.
6. **Limpeza** — helper de erros, proteger `checkConnectorStatus`.

Cada passo é independente e testável. Posso executar tudo de uma vez ou ir item a item — qual prefere?

### Detalhes técnicos

- A migração das FKs requer `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE SET NULL`. Colunas `corretor_user_id` em `nf_requests` e `commission_requests` precisam virar `NULL`-aceitáveis (hoje são `NOT NULL`). Decisão: manter `NOT NULL` e usar `CASCADE`? Ou permitir nulo? **Recomendo SET NULL + nullable** — preserva o histórico financeiro mesmo se o corretor for removido.
- O retry de 401 será implementado adicionando lógica no `attachSupabaseAuth` middleware (já existe em `src/integrations/supabase/auth-attacher.ts`) — porém esse arquivo é gerado, então criaremos um wrapper em `src/integrations/supabase/auth-retry.ts`.
- Os índices serão criados com `CREATE INDEX IF NOT EXISTS` para idempotência.