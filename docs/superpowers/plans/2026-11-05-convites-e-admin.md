# Convites, acesso revogável e página de administração — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O Projeta passa a ser **só por convite**. O administrador da plataforma envia convites por e-mail; cada convidado ganha um **Projeta só dele** (workspace pessoal, dono dos próprios projetos) até o administrador **revogar o acesso**. O administrador tem uma página com convites enviados, usuários, taxa de uso e atividade.

**Decisões do dono do produto (05/11/2026):** convite por e-mail; o convidado tem o sistema próprio (não vê os projetos do admin); cadastro somente por convite; página de admin com convites enviados, taxa de uso e informações relevantes.

**Architecture:**
- **Banco** (migração nova): `private.platform_admins`, `public.platform_invites`, `public.user_access`, função `private.is_active_user()` aplicada nas helpers de RLS (efeito imediato da revogação), trigger em `auth.users` que bloqueia cadastro sem convite pendente, RPCs de leitura do admin.
- **Edge Function** `admin-users` (service role, nunca no navegador): enviar/reenviar/revogar convite, revogar/restaurar usuário (com `ban` no Auth), via `auth.admin.inviteUserByEmail`.
- **App:** login sem "Criar conta", tela "Defina sua senha" ao abrir o convite, tela "Acesso revogado", página **Administração** visível só para admin.

**Tech Stack:** Supabase Postgres 17 + Auth Admin API + Edge Functions (Deno), React 18, Vitest (+ jsdom), supabase-js 2.

## Global Constraints

- Todas as mensagens ao usuário em português; erros passam por `friendlyDbError`/`authErrorMessage`.
- `service_role` só na Edge Function e em `tests/rls/`; nunca no bundle.
- Toda função SQL: `set search_path = ''`. `security definer` só em `private`, exceto RPCs públicas que precisam ler `private` — estas conferem `auth.uid()`/admin no corpo e têm `execute` revogado de `public, anon`.
- Migrações aplicadas apenas com `npm run db:push:staging`; migração aplicada nunca é editada.
- Tokens apenas (sem cor/medida literal fora de `tokens.css`); overlays via componentes Radix existentes.
- O convidado nunca vê dados de outro usuário; o admin vê **métricas agregadas e metadados de conta**, não o conteúdo dos projetos alheios.

## Interfaces fixadas (todas as tarefas usam exatamente estes nomes)

**Tabelas**
- `private.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz default now())`
- `public.platform_invites(id uuid pk default gen_random_uuid(), email text not null check (email = lower(trim(email)) and position('@' in email) > 1), note text not null default '' check (char_length(note) <= 500), status text not null default 'pending' check (status in ('pending','accepted','revoked')), invited_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '14 days', sent_count int not null default 0, last_sent_at timestamptz, last_error text, accepted_user_id uuid references auth.users(id) on delete set null, accepted_at timestamptz, revoked_at timestamptz)` — índice único `(email) where status = 'pending'`. "Expirado" é derivado na leitura: `status = 'pending' and expires_at < now()`.
- `public.user_access(user_id uuid pk references auth.users(id) on delete cascade, status text not null default 'active' check (status in ('active','revoked')), invite_id uuid references public.platform_invites(id) on delete set null, revoked_at timestamptz, revoked_by uuid, updated_at timestamptz not null default now())` — backfill: todo usuário existente = `active`.

**RLS / grants**
- `platform_invites`: select só para admin (`(select private.is_platform_admin())`); nenhuma escrita pelo cliente (`revoke all` de anon/authenticated, `grant select` a authenticated).
- `user_access`: select da própria linha (`user_id = (select auth.uid())`) ou admin; nenhuma escrita pelo cliente.
- `private.is_platform_admin() returns boolean` e `private.is_active_user() returns boolean` (sql stable definer, search_path '').
- **Efeito imediato da revogação:** `private.project_ids_with_role`, `private.is_workspace_member`, `private.is_workspace_owner` passam a exigir `private.is_active_user()`; as policies de `projects` que usam `owner_id = (select auth.uid())` ganham `and (select private.is_active_user())`; `ensure_personal_workspace()` levanta `raise exception 'access_revoked' using errcode = '42501'` quando o usuário não está ativo e, no primeiro acesso, marca o convite do usuário como `accepted` (`accepted_at = now()`).
- **Cadastro só por convite:** trigger `before insert on auth.users` → `private.enforce_invite_only()` levanta `raise exception 'invite_required' using errcode = '42501'` se não houver convite `pending` e não expirado para `lower(new.email)`. Trigger `after insert on auth.users` → `private.link_invite_on_signup()` grava `accepted_user_id` no convite e cria `user_access(status 'active', invite_id)`.

**RPCs (public, security definer, só admin; senão `42501`)**
- `public.am_i_platform_admin() returns boolean` (qualquer autenticado pode chamar; responde só sobre si).
- `public.admin_overview() returns jsonb` com as chaves: `users_total, users_active, users_revoked, invites_pending, invites_expired, invites_accepted, invites_revoked, acceptance_rate` (aceitos ÷ (aceitos + pendentes + expirados), 0–1, 2 casas), `active_7d, active_30d` (por `auth.users.last_sign_in_at`), `projects, tasks, anomalies, minutes, actions_open`.
- `public.admin_list_users() returns table(user_id uuid, email text, display_name text, status text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz, invited_at timestamptz, projects int, tasks int, anomalies int, minutes int, last_activity_at timestamptz, photos_bytes bigint)` — contagens dos projetos de que o usuário é `owner`; `last_activity_at` = maior `updated_at` entre projetos/tarefas/anomalias/atas dele.

**Edge Function `admin-users`** — `POST /functions/v1/admin-users`, corpo `{ action, ... }`, cabeçalho `Authorization: Bearer <jwt do admin>`:
- `invite { email, note? }` → cria (ou reaproveita) convite `pending`, chama `auth.admin.inviteUserByEmail(email, { redirectTo: SITE_URL })`, incrementa `sent_count`/`last_sent_at`; erro de envio grava `last_error` e responde 502.
- `resend { inviteId }`, `revoke_invite { inviteId }`
- `revoke_user { userId }` → `user_access.status = 'revoked'` + `auth.admin.updateUserById(userId, { ban_duration: '876000h' })`; recusa revogar a si mesmo ou outro admin (400).
- `restore_user { userId }` → `active` + `ban_duration: 'none'`.
- Respostas JSON `{ ok: true, data }` ou `{ ok: false, error: { code, message } }` com `message` em português; CORS para o domínio do app e `localhost:5174`.
- Lógica em `supabase/functions/admin-users/handler.js` (ESM puro, clientes injetados, testável no Vitest); `index.ts` só monta os clientes e chama `Deno.serve`.

**Cliente**
- `src/features/admin/adminRepository.js`: `amIPlatformAdmin(): Promise<boolean>`, `getAdminOverview()`, `listAdminUsers()`, `listInvites()` (select em `platform_invites` com status de exibição `pending|expired|accepted|revoked`), `adminAction(action, payload)` via `supabase.functions.invoke('admin-users', { body })`.
- `state.auth.isPlatformAdmin: boolean` (carregado após `AUTH_READY`); página global `pageAdmin` no AppRail ("Administração", só admin).
- `state.auth.mustSetPassword: boolean` — verdadeiro quando o app abre com `type=invite` no hash da URL.

## Review Focus
1. **Testes existentes quebram com o cadastro só por convite**: o harness cria usuários pelo admin; `createTestUser` precisa criar o convite antes e a limpeza precisa apagar os convites de teste (Task 1).
2. **Revogação com efeito imediato**: um usuário revogado com JWT ainda válido não lê nem grava nada (projetos, tarefas, anomalias, atas, workspace) — testado.
3. **O admin nunca se tranca para fora** (não pode revogar a si nem a outro admin).
4. **Convite já aceito / usuário já existente** ao reenviar ou convidar de novo: resposta clara em português, sem duplicar usuário.
5. **Primeiro acesso pelo link do convite** cai em "Defina sua senha", não no app sem senha.

---

### Task 1: Banco — admins, convites, acesso revogável, RPCs do admin (worktree adm-db)
**Files:** Create `supabase/migrations/20261105000000_platform_admin_and_invites.sql`, `tests/rls/admin.test.js`; Modify `tests/rls/helpers.js` (convite antes de criar usuário; limpeza dos convites; helper `sql(text, params)` via `pg` com `RLS_DB_URL` para semear `private.platform_admins` nos testes), `package.json` (devDependency `pg`), `supabase/configure_admin_user.sql` (conceder admin da plataforma por e-mail).
- [ ] Testes que falham: não-admin não lê convites nem `user_access` alheio e recebe 42501 em `admin_overview`/`admin_list_users`; admin recebe as chaves exatas; `createUser` sem convite falha com `invite_required`; com convite passa, e o convite fica com `accepted_user_id` e `user_access` ativo; primeiro `ensure_personal_workspace` marca `accepted`; usuário revogado (via service role) recebe `[]` em projetos/tarefas/anomalias/atas, erro em escrita e `access_revoked` na RPC; restaurado volta a ver; `am_i_platform_admin` verdadeiro só para admin; todas as suítes antigas continuam verdes.
- [ ] Migração, push, iterar até tudo verde; commit `feat(db): invite-only platform, revocable access and admin RPCs`.

### Task 2: Edge Function `admin-users` (worktree adm-edge)
**Files:** Create `supabase/functions/admin-users/handler.js`, `supabase/functions/admin-users/index.ts`, `supabase/functions/admin-users/handler.test.js`, `supabase/functions/admin-users/deno.json` (imports), doc curta em `supabase/README.md`.
- [ ] Testes com clientes falsos: sem JWT → 401; não-admin → 403; `invite` valida e normaliza e-mail, reaproveita convite pendente, conta envio, grava `last_error` em falha (502); usuário já ativo → 409 `user_exists`; `revoke_user` em si mesmo/outro admin → 400; `revoke_user`/`restore_user` atualizam `user_access` e chamam `updateUserById` com o `ban_duration` certo; OPTIONS/CORS.
- [ ] Commit `feat(edge): admin-users function for invites and access`. (Deploy é feito pelo controlador.)

### Task 3: App — login só por convite, "Defina sua senha", "Acesso revogado" (worktree adm-auth)
**Files:** Modify `src/pages/AuthPage.jsx`, `src/pages/PublicLanding.jsx` (CTAs), `src/context/AppContext.jsx`, `src/App.jsx`, `src/utils/authErrors.js`, `src/utils/supabaseRepository.js` (`access_revoked`, `invite_required`); tests.
- [ ] Sem modo/links de cadastro ("O acesso ao Projeta é feito por convite."); `type=invite` no hash ao abrir → `mustSetPassword` → tela "Bem-vindo ao Projeta — defina sua senha" (usa `validatePassword` + `updatePassword`); `access_revoked` → tela "Seu acesso ao Projeta foi revogado. Fale com o administrador." com "Sair" (sem "Tentar de novo"); `invite_required`/`signup_disabled` → "O acesso ao Projeta é feito por convite."; testes de reducer, `authErrors`, `friendlyDbError` e jsdom da tela de senha.
- [ ] Commit `feat(auth): invite-only access, set-password on invite, revoked screen`.

### Task 4: Página de Administração (worktree adm-page)
**Files:** Create `src/features/admin/adminRepository.js`, `src/features/admin/PageAdmin.jsx`, `src/features/admin/AdminOverview.jsx`, `src/features/admin/AdminInvites.jsx`, `src/features/admin/AdminUsers.jsx`, tests; Modify `src/components/shell/AppRail.jsx`, `src/App.jsx` (rota lazy `pageAdmin`), `src/context/AppContext.jsx` (`isPlatformAdmin`).
- [ ] **Visão geral**: faixa de KPIs (Usuários ativos, Convites pendentes, Taxa de aceitação, Ativos 7 dias, Ativos 30 dias, Projetos, Tarefas, Atas, Ações abertas) + "Usuários mais ativos" (top 5 por `last_activity_at`).
- [ ] **Convites**: formulário (E-mail, Observação, "Enviar convite"), tabela (e-mail, status Pendente/Aceito/Expirado/Revogado, enviado em, nº de envios, expira em, último erro), ações Reenviar/Revogar (ConfirmDialog).
- [ ] **Usuários**: tabela (nome, e-mail, status, admin, criado em, último acesso, projetos, tarefas, atas, anomalias, última atividade, fotos em MB), ações Revogar/Restaurar (ConfirmDialog; desabilitado para si mesmo e admins).
- [ ] Item "Administração" no AppRail só com `isPlatformAdmin`; testes jsdom com repositório mockado; commit `feat(admin): administration page with invites, users and usage`.

### Task 5 (controlador): integrar, publicar migração e função, semear o admin, revisão final
- [ ] `db:push:staging`, `supabase functions deploy admin-users --use-api`, `supabase secrets set SITE_URL=https://projeta.richardvieira.com.br`, inserir o usuário dono em `private.platform_admins`; revisão final; publicação só com aprovação do dono.
- [ ] Painel do Supabase (dono): SMTP próprio (o SMTP padrão só envia para membros da organização), desligar "Allow new users to sign up", modelo de e-mail de convite em português.
