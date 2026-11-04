# Fase 1 — Segurança e base SaaS: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as brechas de RLS (S1–S12 do plano mestre) e trocar o acesso por workspace por acesso **por papel no projeto**, pronto para times, com testes automatizados que provam o isolamento.

**Architecture:** Três migrações SQL novas reescrevem as policies. Todas as tabelas de projeto passam a perguntar `private.project_ids_with_role(min_role)`, que lê `project_members`. Hoje só existe a linha do dono; com times, entram novas linhas e a RLS não muda. Testes de integração em Node usam dois usuários reais contra um projeto Supabase de **staging**, fazendo o mesmo caminho de um atacante: anon key e PostgREST.

**Tech Stack:** Supabase Postgres 15, PostgREST, supabase-js 2, Vitest 2, Vercel.

**Spec:** [2026-11-04-plano-de-acao-projeta.md](2026-11-04-plano-de-acao-projeta.md), seção "Fase 1" e diagnóstico 2.1.

## Global Constraints

- Postgres 15+: o plano usa `on delete set null (coluna)`.
- Testes de RLS **nunca** rodam contra a produção. O helper aborta se a URL contiver `bnfnbukwyvqzgpifeukm`.
- `service_role` só em `tests/rls/` e `scripts/`, lida de `.env.test.local` ou do ambiente. Nunca com prefixo `VITE_`.
- Toda função SQL tem `set search_path = ''`. Funções `security definer` ficam no schema `private`, exceto `public.ensure_personal_workspace()`, que precisa ser RPC e confere `auth.uid()` no corpo.
- O cliente nunca grava `workspace_members` nem `project_members`.
- Mensagens ao usuário em português.
- Migrações nomeadas `YYYYMMDDHHMMSS_snake_case.sql` em `supabase/migrations/`.
- Comandos de banco em staging: `npm run db:push:staging` (definido na Task 1).

## Review Focus

1. **Dados de produção que violam as regras novas** (status fora da lista, foto acima do limite, anomalia ligada a tarefa de outro projeto). A migração precisa limpar antes de validar, ou o `db push` falha em produção. A Task 9 inclui consultas de pré-voo.
2. **Primeiro login de um usuário novo.** O perfil vem do trigger e o workspace vem da RPC. Tem que funcionar sem nenhuma linha prévia. Teste na Task 2.
3. **Criar projeto e ler de volta na mesma requisição** (`upsert().select().single()`). A linha nova tem que passar na policy de SELECT antes de o trigger criar o `project_members`. Teste na Task 3.
4. **Excluir uma tarefa ligada a uma anomalia.** A anomalia continua existindo, com `task_id` nulo. Teste na Task 3.
5. **Usuário que já é membro de workspace alheio** (pela brecha S1 ou pelo script de admin). A RPC devolve sempre o workspace pessoal dele. Teste na Task 2.

---

### Task 1: Ambiente de staging e harness de testes de RLS

**Files:**
- Create: `vitest.rls.config.js`
- Create: `tests/rls/helpers.js`
- Create: `tests/rls/isolation.test.js`
- Modify: `vite.config.js` (bloco `test`)
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**
- Produces, em `tests/rls/helpers.js`:
  - `assertNotProduction(url: string): void`: lança erro se a URL contiver `bnfnbukwyvqzgpifeukm`.
  - `adminClient(): SupabaseClient`, com a service role.
  - `createTestUser(label: string): Promise<{ id: string, email: string, client: SupabaseClient }>`. Cria o usuário pelo admin com `email_confirm: true` e e-mail `rls-${label}-${RUN_ID}@projeta.test`, depois faz login com a anon key.
  - `bootstrapWorkspace(user): Promise<WorkspaceRow>`. Nesta task insere direto em `workspaces`, como o app faz hoje; a Task 2 troca a implementação pela RPC, sem mudar a assinatura.
  - `createProject(user, workspaceId: string, fields?: object): Promise<ProjectRow>`
  - `createTask(user, project: ProjectRow, fields?: object): Promise<TaskRow>`
  - `createAnomaly(user, project: ProjectRow, fields?: object): Promise<AnomalyRow>`
  - `cleanupTestUsers(): Promise<void>`. Pelo admin, apaga primeiro os workspaces dos usuários deste run (o `owner_id` tem `on delete restrict`) e depois os usuários.
- Produces, scripts npm:
  - `test:rls`: `vitest run --config vitest.rls.config.js`
  - `db:push:staging`: `sh -c 'set -a; . ./.env.test.local; set +a; supabase db push --db-url "$RLS_DB_URL"'`

- [ ] **Step 1: Pré-requisito manual.** Criar um projeto Supabase gratuito "Projeta Staging" na região `sa-east-1`. Criar `.env.test.local` (já ignorado por `*.local`) com `RLS_SUPABASE_URL`, `RLS_SUPABASE_ANON_KEY`, `RLS_SUPABASE_SERVICE_ROLE_KEY` e `RLS_DB_URL` (connection string do pooler em modo session).
- [ ] **Step 2: Higiene.** Adicionar `supabase/.temp/` ao `.gitignore` e rodar `git rm -r --cached supabase/.temp`.
- [ ] **Step 3: Configs.** `vitest.rls.config.js` com `include: ['tests/rls/**/*.test.js']`, `environment: 'node'`, `testTimeout: 30000`, `fileParallelism: false` e `env: loadEnv('test', process.cwd(), 'RLS_')`. Em `vite.config.js`, acrescentar `test: { exclude: ['node_modules/**', 'dist/**', 'tests/rls/**'] }` para `npm test` continuar só com os testes unitários.
- [ ] **Step 4: Aplicar as migrações atuais no staging.** Rodar `npm run db:push:staging`. Esperado: as quatro migrações existentes aplicadas sem erro.
- [ ] **Step 5: Escrever os testes de isolamento**, que devem passar já hoje como proteção contra regressão. Em `tests/rls/isolation.test.js`, com `beforeAll` criando os usuários A e B, cada um com workspace, projeto, tarefa e anomalia, e `afterAll(cleanupTestUsers)`:
  - `B não lê projetos, tarefas nem anomalias de A`: `B.client.from(t).select('*').eq('id', idDeA)` retorna `[]` para cada uma das três tabelas.
  - `B não altera nem apaga dados de A`: `update({ name: 'x' })` e `delete()` com `eq('id', idDeA)` retornam `[]` com `.select()`, e o admin relê a linha intacta.
  - `B não insere tarefa no projeto de A`: o insert com `project_id` e `workspace_id` de A retorna erro `42501`.
  - `anon não lê nada`: um cliente sem login recebe `[]` em `projects`.
- [ ] **Step 6: Rodar.** `npm run test:rls`. Esperado: 4 testes PASS. `npm test` continua com 133 PASS.
- [ ] **Step 7: Commit.** `git add -A vitest.rls.config.js tests/rls vite.config.js package.json .gitignore && git commit -m "test(rls): staging harness and cross-tenant isolation suite"`

---

### Task 2: Endurecer workspaces e membros (S1, S2, perfis)

**Files:**
- Create: `supabase/migrations/20261104000000_harden_workspaces.sql`
- Create: `tests/rls/workspaces.test.js`
- Modify: `tests/rls/helpers.js` (`bootstrapWorkspace` passa a usar a RPC)
- Modify: `src/utils/supabaseRepository.js:149-171` (`ensureWorkspace`)

**Interfaces:**
- Produces:
  - SQL `public.ensure_personal_workspace() returns public.workspaces`. Idempotente; devolve sempre o workspace pessoal do chamador.
  - SQL `private.forbid_column_changes()`, trigger genérica que recebe os nomes de coluna em `TG_ARGV` e lança `42501` se algum mudar.
  - SQL `private.stamp_created_at()`, trigger `before insert` que força `created_at = now()`.
  - Colunas `workspaces.is_personal boolean not null default false` e `workspaces.plan text not null default 'free' check (plan in ('free','pro'))`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/rls/workspaces.test.js`:
  - `dono não adiciona outro usuário como membro`: o insert de A em `workspace_members` com `user_id: B.id` dá erro `42501`.
  - `dono não transfere a posse do workspace`: o update de `owner_id` para B dá erro e o admin relê o `owner_id` como A.
  - `usuário não muda o próprio plano`: o update `{ plan: 'pro' }` dá erro.
  - `usuário não cria workspace direto`: o insert em `workspaces` dá erro `42501`.
  - `usuário não grava created_at no passado`: o insert de projeto com `created_at: '2000-01-01'` resulta em `created_at` de hoje.
  - `ensure_personal_workspace é idempotente`: duas chamadas devolvem o mesmo `id`, com `is_personal === true`.
  - `primeiro acesso de usuário novo`: um usuário recém-criado, sem workspace, recebe um da RPC.
  - `RPC ignora workspace alheio mais antigo`: o admin insere A como membro do workspace de B e muda o `created_at` desse workspace para `2000-01-01`; a RPC de A continua devolvendo o workspace de A.
- [ ] **Step 2: Rodar e ver falhar.** `npm run test:rls -- workspaces`. Esperado: os testes de insert de membro, posse, plano, insert direto e `created_at` FAIL; a RPC FAIL com "function not found".
- [ ] **Step 3: Escrever a migração** `20261104000000_harden_workspaces.sql`:
  - `workspace_members`: `drop policy workspace_members_owner_manage` e `revoke insert, update, delete on public.workspace_members from authenticated`. Membros só entram por trigger ou função.
  - `workspaces`:
    - adicionar `is_personal` e `plan`;
    - backfill marcando como pessoal o workspace mais antigo de cada `owner_id`;
    - `create unique index workspaces_one_personal_per_owner on public.workspaces (owner_id) where is_personal`;
    - `drop policy workspaces_owner_insert` e `revoke insert on public.workspaces from authenticated`;
    - `revoke update on public.workspaces from authenticated` seguido de `grant update (name, timezone) on public.workspaces to authenticated`. Os grants por coluna resolvem S2 e o plano;
    - recriar `workspaces_owner_update` com `with check (owner_id = (select auth.uid()))`.
  - `private.forbid_column_changes()`: percorre `TG_ARGV`, compara `to_jsonb(new) -> col` com `to_jsonb(old) -> col` e, se `is distinct from`, faz `raise exception '% não pode ser alterado', col using errcode = '42501'`.
  - `private.stamp_created_at()`, aplicada `before insert` em `projects`, `tasks` e `anomalies`.
  - Triggers `before update`:
    - `projects`: `forbid_column_changes('workspace_id', 'created_at')`;
    - `tasks` e `anomalies`: `forbid_column_changes('workspace_id', 'project_id', 'created_at')`.
  - `public.ensure_personal_workspace()`, `security definer`:
    - `uid := auth.uid()`; se for nulo, `raise exception 'not authenticated' using errcode = '42501'`;
    - `insert ... (name, owner_id, is_personal) values (coalesce(display_name do profile, 'Meu') || ' workspace', uid, true) on conflict (owner_id) where is_personal do nothing`;
    - devolve a linha com `owner_id = uid and is_personal`;
    - `revoke execute ... from public, anon` e `grant execute ... to authenticated`.
  - `profiles`: trocar `profiles_self_access` (FOR ALL) por três policies, select, insert e update, todas com `id = (select auth.uid())`. Sem delete.
- [ ] **Step 4: Atualizar o app.** `ensureWorkspace(user)` mantém o upsert de profile e troca o select e o insert por `client.rpc('ensure_personal_workspace').single()`. `bootstrapWorkspace` dos testes faz o mesmo.
- [ ] **Step 5: Aplicar e rodar.** `npm run db:push:staging && npm run test:rls`. Esperado: tudo PASS, incluindo `isolation.test.js`.
- [ ] **Step 6: Commit.** `git commit -m "fix(rls): lock workspace membership, ownership and plan; personal workspace RPC"`

---

### Task 3: Papel por projeto, `project_members` e FK de anomalia (S3, S12)

**Files:**
- Create: `supabase/migrations/20261104010000_project_members_rls.sql`
- Create: `tests/rls/project-roles.test.js`

**Interfaces:**
- Consumes: `private.forbid_column_changes`, `private.stamp_created_at` (Task 2).
- Produces:
  - Tabela `public.project_members(project_id uuid, user_id uuid, role text check (role in ('owner','editor','viewer')), added_at timestamptz, primary key (project_id, user_id))`.
  - Coluna `projects.owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`.
  - Função `private.project_ids_with_role(min_role text) returns setof uuid`: `stable`, `security definer`, devolve os projetos em que o chamador tem papel maior ou igual a `min_role`, na ordem `viewer < editor < owner`.
  - A regra que toda tabela de projeto futura (Fases 2, 4 e 5) copia:
    - select: `project_id in (select private.project_ids_with_role('viewer'))`;
    - insert, update e delete: o mesmo com `'editor'`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/rls/project-roles.test.js`. Cenário: A é dono do projeto P; o admin insere `project_members (P, B, 'viewer')` e `(P, C, 'editor')`; D não tem vínculo.
  - `dono cria projeto e lê de volta na mesma requisição`: `upsert(row).select().single()` devolve a linha com `owner_id === A.id`.
  - `viewer lê tarefas mas não escreve`: o select de B em `tasks` filtrado por P devolve 1 linha; o update de B devolve `[]`; o insert de B dá erro `42501`.
  - `editor escreve tarefas mas não apaga o projeto`: o update de C em uma tarefa altera a linha; o delete de C em `projects` devolve `[]` e o projeto continua existindo.
  - `sem vínculo não vê nada`: D recebe `[]` em `projects`, `tasks` e `anomalies` de P.
  - `ninguém grava project_members pelo cliente`: o insert de A dá erro `42501`.
  - `owner_id e project_id são imutáveis`: o update de `projects.owner_id` dá erro; o update de `tasks.project_id` para outro projeto de A dá erro.
  - `anomalia não aponta para tarefa de outro projeto`: um insert com `task_id` de um projeto Q dá erro `23503`.
  - `apagar tarefa preserva a anomalia`: depois do delete da tarefa, a anomalia existe com `task_id === null`.
- [ ] **Step 2: Rodar e ver falhar.** `npm run test:rls -- project-roles`. Esperado: FAIL, porque `project_members` ainda não existe.
- [ ] **Step 3: Escrever a migração**:
  - `projects.owner_id`:
    - adicionar a coluna;
    - backfill a partir de `workspaces.owner_id`;
    - `set not null` e `set default auth.uid()`;
    - estender o trigger da Task 2 para `forbid_column_changes('workspace_id', 'owner_id', 'created_at')`.
  - `project_members`:
    - criar a tabela, com índice em `user_id`, `enable` e `force row level security`;
    - grant de `select` apenas;
    - policy de select com `user_id = (select auth.uid()) or project_id in (select private.project_ids_with_role('owner'))`;
    - backfill `insert ... select id, owner_id, 'owner' from projects on conflict do nothing`.
  - Trigger `private.add_project_owner()`, `after insert` em `projects`, `security definer`, que insere a linha do dono.
  - `private.project_ids_with_role(min_role text)`, com o comparativo de papéis por `case`; `revoke execute from public, anon`; `grant execute to authenticated`.
  - Policies, depois de `drop` de `projects_member_access`, `tasks_member_access` e `anomalies_member_access`:
    - `projects`:
      - select: `owner_id = (select auth.uid()) or id in (select private.project_ids_with_role('viewer'))`. O teste de dono é por coluna para a linha nova passar antes do trigger `after insert` (Review Focus 3);
      - insert: `with check (owner_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)))`;
      - update: `using` e `with check` com `owner_id = (select auth.uid()) or id in (select private.project_ids_with_role('editor'))`;
      - delete: `owner_id = (select auth.uid())`.
    - `tasks` e `anomalies`: a regra padrão das Interfaces, separada em quatro policies, select, insert, update e delete.
  - FK de anomalia:
    - `alter table public.tasks add constraint tasks_id_project_id_key unique (id, project_id)`;
    - limpar com `update anomalies set task_id = null` onde a tarefa não pertence ao mesmo projeto;
    - `drop constraint anomalies_task_id_fkey`;
    - `add constraint anomalies_task_same_project_fkey foreign key (task_id, project_id) references public.tasks (id, project_id) on delete set null (task_id)`.
- [ ] **Step 4: Aplicar e rodar tudo.** `npm run db:push:staging && npm run test:rls`. Esperado: as três suítes PASS.
- [ ] **Step 5: Smoke test do app contra o staging.** Rodar `npm run dev` com as variáveis `VITE_*` apontando para o staging. Criar um projeto, uma tarefa e uma anomalia com foto, recarregar e conferir que tudo persiste.
- [ ] **Step 6: Commit.** `git commit -m "feat(rls): per-project roles with project_members; same-project anomaly FK"`

---

### Task 4: Restrições de dados e limites de plano (S4, S5)

**Files:**
- Create: `supabase/migrations/20261104020000_constraints_and_plan_limits.sql`
- Create: `tests/rls/constraints.test.js`

**Interfaces:**
- Produces:
  - Tabela `private.plan_limits(plan text primary key, max_projects int not null)` com `('free', 10)` e `('pro', 200)`.
  - Erro do limite: `raise exception 'plan_limit_projects' using errcode = 'P0001'`. A Task 5 traduz para o usuário.

- [ ] **Step 1: Escrever os testes que falham**:
  - `rejeita status de projeto desconhecido`: `status: 'Qualquer'` dá erro `23514`.
  - `rejeita severidade e status de anomalia desconhecidos`: erro `23514` nos dois casos.
  - `rejeita nome de tarefa acima de 500 caracteres`: erro `23514`.
  - `rejeita fotos acima de 3 MB`: `photos: ['data:image/jpeg;base64,' + 'A'.repeat(3_100_000)]` dá erro `23514`.
  - `bloqueia o 11º projeto no plano free`: com 10 projetos criados, o 11º dá erro cuja mensagem contém `plan_limit_projects`.
- [ ] **Step 2: Rodar e ver falhar.** `npm run test:rls -- constraints`
- [ ] **Step 3: Escrever a migração.** Cada constraint é precedida da limpeza dos dados existentes (Review Focus 1). Os status inválidos viram `'Planejado'` em projetos e `'aberta'` em anomalias; severidades inválidas viram `null`.
  - `projects.status in ('Planejado','Em Andamento','Concluído','Pausado')`
  - `anomalies.status in ('aberta','em análise','resolvida','cancelada')`
  - `anomalies.severity is null or severity in ('baixa','média','alta','crítica')`
  - Tamanhos:
    - `projects.name` ≤ 200 e `projects.description` ≤ 5000;
    - `tasks.name` ≤ 500;
    - `anomalies.title` ≤ 300 e `anomalies.description` ≤ 10000.
  - `octet_length(photos::text) <= 3000000` em `anomalies`.
  - `octet_length(metadata::text) <= 100000` em `projects`, `tasks` e `anomalies`.
  - Trigger `private.enforce_project_limit()`, `before insert` em `projects`, `security definer`, que compara `count(*)` do workspace com o `max_projects` do `workspaces.plan`.
- [ ] **Step 4: Aplicar e rodar.** `npm run db:push:staging && npm run test:rls`. Esperado: tudo PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): domain checks, size limits and plan project limit"`

---

### Task 5: Repositório: leitura segura do metadata e erros amigáveis (A6)

**Files:**
- Modify: `src/utils/supabaseRepository.js`
- Create: `src/utils/supabaseRepository.test.js`

**Interfaces:**
- Produces:
  - Exportar `projectFromRow`, `taskFromRow` e `anomalyFromRow`.
  - `friendlyDbError(error): string`, em português.

- [ ] **Step 1: Escrever os testes que falham**:
  - `projectFromRow mantém o id da linha mesmo com metadata.id`: `projectFromRow({ id: 'p1', name: 'A', metadata: { id: 'x', workspaceId: 'w' } }).id === 'p1'`.
  - `taskFromRow mantém projectId e id`, com `metadata: { projectId: 'x', id: 'y' }`.
  - `anomalyFromRow mantém id e projectId`.
  - `friendlyDbError traduz o limite de plano`: `{ message: 'plan_limit_projects' }` vira `'Você atingiu o limite de projetos do seu plano.'`.
  - `friendlyDbError traduz permissão negada`: `{ code: '42501' }` vira `'Você não tem permissão para esta ação.'`.
  - `friendlyDbError traduz restrição de dados`: `{ code: '23514' }` vira `'Algum campo está fora do formato ou do tamanho permitido.'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/utils/supabaseRepository.test.js`
- [ ] **Step 3: Implementar.** Nos três `*FromRow`, espalhar `...(row.metadata || {})` **antes** dos campos principais. `friendlyDbError` cai em `error.message` quando o código é desconhecido. `saveErrorMessage` em `AppContext.jsx` passa a usar `friendlyDbError`.
- [ ] **Step 4: Rodar.** `npm test`. Esperado: tudo PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix(data): core fields win over metadata; friendly DB errors"`

---

### Task 6: Autenticação: senha forte e recuperação de senha (S6)

**Files:**
- Create: `src/utils/password.js`
- Create: `src/utils/password.test.js`
- Modify: `src/pages/AuthPage.jsx`
- Modify: `src/context/AppContext.jsx` (evento de recuperação e ações novas)
- Modify: `src/App.jsx` (renderizar o modo `reset`)

**Interfaces:**
- Produces:
  - `validatePassword(password: string): string | null`. Devolve a mensagem de erro, ou `null` se a senha for válida.
  - No contexto:
    - `requestPasswordReset(email: string): Promise`, que chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl })`;
    - `updatePassword(password: string): Promise`, que chama `supabase.auth.updateUser({ password })`;
    - `state.auth.recovery: boolean`, que vira `true` no evento `PASSWORD_RECOVERY`.

- [ ] **Step 1: Escrever os testes que falham**:
  - `recusa menos de 10 caracteres`: `validatePassword('abc12345')` devolve `'Use pelo menos 10 caracteres.'`.
  - `exige letra e número`: `validatePassword('aaaaaaaaaaaa')` e `validatePassword('123456789012')` devolvem `'Use letras e números.'`.
  - `aceita senha válida`: `validatePassword('projeta2026ok') === null`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/utils/password.test.js`
- [ ] **Step 3: Implementar.**
  - `AuthPage` ganha os modos `forgot` (só e-mail) e `reset` (nova senha e confirmação), e um link "Esqueci minha senha" no login.
  - A mensagem do `forgot` é sempre neutra, para não revelar se a conta existe: "Se houver uma conta com este e-mail, enviamos um link para redefinir a senha."
  - O `submit` do signup e do reset usa `validatePassword`.
- [ ] **Step 4: Configuração manual no painel do Supabase** (produção e staging), registrada em `supabase/README.md`:
  - Auth → Email: "Confirm email" ligado.
  - Password: mínimo de 10 caracteres, com letras e dígitos.
  - "Leaked password protection" ligado (requer plano Pro; senão, fica anotado para a Fase 6).
  - Site URL e Redirect URLs só com `https://projeta.richardvieira.com.br` e o domínio de preview da Vercel.
  - Rate limits de e-mail revisados.
- [ ] **Step 5: Verificação manual** em `npm run dev`: pedir a redefinição, abrir o link do e-mail, cair na tela "Nova senha", trocar, sair e entrar com a senha nova.
- [ ] **Step 6: Commit.** `git commit -m "feat(auth): password policy and password recovery flow"`

---

### Task 7: Cabeçalhos de segurança e fonte servida pelo app (S7, S9)

**Files:**
- Modify: `vercel.json`
- Create: `tests/config/vercel-headers.test.js`
- Modify: `index.html` (remover os `<link>` do Google Fonts)
- Modify: `src/main.jsx` (`import '@fontsource-variable/inter'`)
- Modify: `src/styles/tokens.css` (`--font-ui` passa a incluir `'Inter Variable'` antes de `'Inter'`)
- Modify: `package.json` (dependência `@fontsource-variable/inter`)

- [ ] **Step 1: Escrever o teste que falha** em `tests/config/vercel-headers.test.js`. Ele lê `vercel.json` e verifica que a regra `source: '/(.*)'` contém:
  - `Content-Security-Policy` com `frame-ancestors 'none'`, `object-src 'none'` e `connect-src` incluindo `https://*.supabase.co wss://*.supabase.co`;
  - `Strict-Transport-Security` com `max-age=63072000; includeSubDomains`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `X-Frame-Options: DENY`;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

  Um segundo teste confere que `index.html` não contém `fonts.googleapis.com`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run tests/config`
- [ ] **Step 3: Implementar.** A CSP completa:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.supabase.co; font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  ```
  O `style-src` precisa de `'unsafe-inline'` por causa dos atributos `style` do React e do Radix. Para o `input capture` da câmera, o `Permissions-Policy` com `camera=()` não atrapalha: ele abre o app nativo, não usa `getUserMedia`.
- [ ] **Step 4: Rodar.** `npm test && npm run build`. Esperado: PASS e build ok.
- [ ] **Step 5: Verificar no preview.** Depois do deploy de preview na Vercel:
  - `curl -sI <url-preview> | grep -iE 'content-security|strict-transport|x-frame'` mostra os três cabeçalhos;
  - no console do navegador, login, Gantt e anomalia com foto não acusam nenhuma violação de CSP.
- [ ] **Step 6: Commit.** `git commit -m "feat(security): HTTP security headers and self-hosted font"`

---

### Task 8: Trocar `xlsx` pela versão corrigida, carregada sob demanda (S8)

**Files:**
- Modify: `package.json`
- Modify: `src/views/gantt/GanttView.jsx:6` e o handler de exportação perto da linha 1112

- [ ] **Step 1: Instalar a versão corrigida da CDN oficial.** `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- [ ] **Step 2: Carregar sob demanda.** Remover o `import * as XLSX from 'xlsx'` do topo. No handler de exportação, usar `const XLSX = await import('xlsx');` e tornar o handler `async`.
- [ ] **Step 3: Verificar.**
  - `npm audit --omit=dev`: esperado `found 0 vulnerabilities`.
  - `npm run build`: esperado um chunk separado contendo xlsx e o chunk principal menor que os 1.118 kB atuais.
  - Manual: exportar o Gantt para Excel e abrir o arquivo.
- [ ] **Step 4: Commit.** `git commit -m "fix(deps): patched SheetJS, lazy-loaded on export"`

---

### Task 9: Documentação, aposentar SQL manual e publicar em produção (S10, D4)

**Files:**
- Delete: `supabase/fix_workspace_rls_permissions.sql` (o conteúdo já está em `20260825000000_grant_workspace_rls_permissions.sql`)
- Modify: `supabase/configure_admin_user.sql` (marcar `is_personal = true` e não inserir mais `workspace_members` à mão além do owner)
- Modify: `supabase/README.md`: modelo de acesso por papel, como rodar `test:rls` e a checklist de Auth da Task 6
- Modify: `DESIGN.md`: marca `#FF6A00` laranja e grafite `#1A1A1A`, raios reais 9/12/16
- Modify: `PRD.md`, seções 5 (Modelo de acesso) e 9 (Segurança)

- [ ] **Step 1: Atualizar a documentação** e apagar o SQL manual. Commit: `git commit -m "docs: per-project access model, RLS tests, real brand tokens"`
- [ ] **Step 2: Pré-voo em produção.** No SQL Editor de produção, só leitura, contar as linhas que as Tasks 3 e 4 vão limpar:
  - projetos com status fora da lista;
  - anomalias com status ou severidade inválidos;
  - anomalias cuja tarefa é de outro projeto;
  - linhas com `photos` acima de 3 MB;
  - workspaces com mais de 10 projetos.

  Anotar os números. Se houver fotos grandes ou workspace acima do limite, **parar e decidir com o dono do produto** antes de seguir.
- [ ] **Step 3: Backup.** Dashboard → Database → Backups: confirmar que existe backup recente, ou rodar `npx supabase db dump --linked -f backup-pre-fase1.sql` (o arquivo fica fora do git).
- [ ] **Step 4: Aplicar e publicar.** `npx supabase db push` (linkado à produção) e, **logo em seguida**, publicar o frontend. O app antigo não consegue criar workspace para usuários novos depois da migração, então a janela entre os dois passos deve ser de minutos.
- [ ] **Step 5: Verificar em produção.**
  - Login com a conta real: os projetos existentes aparecem.
  - Criar e apagar um projeto de teste.
  - Dashboard → Advisors → Security Advisor: zero alertas.
  - `curl -sI https://projeta.richardvieira.com.br`: os cabeçalhos aparecem.
