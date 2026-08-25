# Supabase

The initial workspace schema lives in `migrations/20260821000000_workspace_schema.sql`.

It models one owner per workspace and any number of members. Projects, tasks and anomalies carry `workspace_id` so tenant filtering and RLS checks do not depend on application joins.

Apply the migration after installing the Supabase CLI and linking the project:

```bash
npx supabase login
npx supabase link --project-ref bnfnbukwyvqzgpifeukm
npx supabase db push
```

The browser client uses only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or ship it to the browser. Invitations that need the Admin Auth API should be implemented in an Edge Function.

## Configurar um usuário proprietário

O Projeta não possui um administrador global. No modelo atual, a permissão
administrativa é o papel `owner` dentro de um workspace. Para corrigir ou
configurar um usuário já criado no Supabase, abra
[`configure_admin_user.sql`](configure_admin_user.sql), altere `v_email`,
`v_display_name` e `v_workspace_name`, e execute o arquivo no SQL Editor do
Supabase.

O script é idempotente: garante o perfil, reutiliza o primeiro workspace que o
usuário já possui ou cria um novo, e garante o membership `owner`. Ele não
altera senha, e-mail ou tokens.

## Corrigir erro de permissão no workspace

Se o log do Supabase mostrar `42501 permission denied for function
is_workspace_member` ou uma requisição `GET /rest/v1/workspaces` com `403`,
execute [`fix_workspace_rls_permissions.sql`](fix_workspace_rls_permissions.sql)
no SQL Editor. A causa é a ausência de `EXECUTE` para o papel `authenticated`
nas funções usadas pelas policies RLS.
