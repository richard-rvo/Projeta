# Supabase

Tudo o que existe no banco vem de `migrations/`. As migrações são a **única
fonte de verdade** do schema, das políticas RLS e dos grants: correções
avulsas no SQL Editor são proibidas (o estado do banco deixaria de ser
reproduzível e os testes de RLS não o cobririam). Para mudar algo, crie uma
migração nova. A pasta `supabase/.temp` (estado local da CLI) está no
`.gitignore` e não deve ser commitada.

O navegador usa somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A
service role key nunca vai para uma variável `VITE_` nem para o bundle. Convites
que precisem da Admin Auth API devem ser feitos em uma Edge Function.

## Modelo de acesso

- **Workspace pessoal.** Cada usuário tem um workspace com `is_personal = true`
  (índice único por dono), criado pela RPC `ensure_personal_workspace()` no
  primeiro acesso. O cliente não insere em `workspaces`; só pode editar `name` e
  `timezone` (grant por coluna). `plan` (`free` ou `pro`) e `is_personal` não
  são graváveis pelo cliente.
- **Membros do workspace.** `workspace_members` e `workspace_invites` não
  aceitam escrita do cliente. O vínculo `owner` nasce por trigger ao criar o
  workspace.
- **Papel por projeto.** O acesso a dados é decidido por `project_members`, com
  os papéis `owner > editor > viewer`. O dono entra por trigger
  (`on_project_created`) ao criar o projeto, com `projects.owner_id` (padrão
  `auth.uid()`). A função `private.project_ids_with_role(min_role)` devolve os
  projetos em que o chamador tem papel igual ou superior.
- **Regra de toda tabela de projeto:** `select` exige `viewer`; `insert`,
  `update` e `delete` exigem `editor`.
- **Colunas imutáveis.** `workspace_id`, `project_id`, `owner_id` e
  `created_at` não mudam depois do insert (trigger `forbid_column_changes`), e
  `created_at` é sempre carimbado pelo servidor.
- **Hoje** só existe a linha do dono em `project_members`; o modelo já está
  pronto para equipes, mas ainda não há fluxo de convite na interface.

| Tabela | Leitura | Escrita pelo cliente |
|---|---|---|
| `profiles` | o próprio usuário | o próprio usuário |
| `workspaces` | membros do workspace | dono, só `name` e `timezone`; criação só pela RPC |
| `workspace_members` | membros do workspace | nenhuma |
| `workspace_invites` | dono do workspace | nenhuma (fluxo ainda não exposto) |
| `project_members` | o próprio vínculo; dono do projeto vê todos | nenhuma (só código `SECURITY DEFINER`) |
| `projects` | `viewer`+ (ou `owner_id`) | criar: membro do workspace como `owner_id`; editar: `editor`+; apagar: dono do projeto |
| `tasks` | `viewer`+ | `editor`+ |
| `anomalies` | `viewer`+ | `editor`+ |
| `meeting_minutes` | `viewer`+ | `editor`+ (preferencialmente pela RPC `save_meeting_minute`) |
| `meeting_actions` | `viewer`+ | nenhuma direta; só pela RPC de salvamento |

## Limites de dados e de plano

- **Domínio:** status de projeto (`Planejado`, `Em Andamento`, `Concluído`,
  `Pausado`), status de anomalia (`aberta`, `em análise`, `resolvida`,
  `cancelada`) e severidade (`baixa`, `média`, `alta`, `crítica`) são `CHECK`s.
- **Tamanho:** nomes e títulos têm limite de caracteres; `anomalies.photos`
  aceita até 3 MB serializados, e `metadata` de projetos, tarefas e anomalias
  até 100 KB.
- **Projetos por workspace:** `free` = 10, `pro` = 200 (tabela
  `private.plan_limits`). O trigger `enforce_project_limit` recusa o excedente
  com o erro `plan_limit_projects` e usa um advisory lock por workspace para
  que inserções concorrentes não furem o limite. O upsert de um projeto que já
  existe não conta.

## Atas de reunião (caminho de salvamento)

`meeting_minutes` guarda o documento (`content`, fonte da verdade), o texto
puro (`content_text`) e um `search_tsv` gerado em português. `meeting_actions` é
só a projeção das ações do documento, para consulta.

O salvamento passa pela RPC `public.save_meeting_minute(p_minute, p_actions)`,
que roda como **`SECURITY INVOKER`**: o upsert da ata cumpre a RLS de quem
chama (viewer e estranho recebem `42501`). As ações são regravadas por
`private.write_meeting_actions`, função **`SECURITY DEFINER`** necessária porque
o cliente só tem `SELECT` em `meeting_actions`; ela confere de novo, com o
`auth.uid()` do chamador, o papel de editor e a existência da ata no projeto.
Tudo acontece na mesma transação. A projeção é tolerante: textos longos são
truncados, `task_id` de tarefa inexistente ou de outro projeto vira `null`, e
`p_actions` que não seja lista é recusado (`22023`).

## Aplicar migrações

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

Produção só recebe `db push` depois de uma verificação em staging (abaixo), de
um backup recente e com o frontend pronto para publicar logo em seguida.

## Testes de RLS (staging)

A suíte em `tests/rls/` roda contra um projeto Supabase **de staging**, nunca
contra produção. Ela cria usuários e workspaces próprios, usa só o que ela
mesma criou e limpa ao final. Cobre isolamento entre tenants, workspaces e
perfis, papéis por projeto, restrições e limites de plano e as atas.

Crie `.env.test.local` (fora do git) com estas chaves; os valores nunca entram
no repositório nem em logs:

- `RLS_SUPABASE_URL`
- `RLS_SUPABASE_ANON_KEY`
- `RLS_SUPABASE_SERVICE_ROLE_KEY`
- `RLS_DB_URL` (conexão Postgres usada por `db:push:staging`)
- `RLS_CONFIRM_PROJECT_REF`

`RLS_CONFIRM_PROJECT_REF` é a trava de alvo: a suíte se recusa a rodar se estiver
vazia ou se a `RLS_SUPABASE_URL` não contiver esse ref.

```bash
npm run db:push:staging   # aplica as migrações no staging (usa RLS_DB_URL)
npm run test:rls          # roda tests/rls/** contra o staging
```

## Configurar um usuário proprietário

O Projeta não tem administrador global: o nível administrativo é o papel
`owner` do workspace (e do projeto). Para configurar um usuário já criado no
Supabase, abra [`configure_admin_user.sql`](configure_admin_user.sql), altere
`v_email`, `v_display_name` e `v_workspace_name` (e o e-mail da consulta final)
e execute no SQL Editor.

O script é idempotente: garante o perfil, reutiliza o workspace pessoal do
usuário (`is_personal = true`) ou cria um, e deixa o vínculo `owner` por conta
do trigger do schema. Não altera senha, e-mail nem tokens. Projetos criados à
mão no SQL Editor precisam informar `owner_id` explicitamente, porque lá
`auth.uid()` é nulo.

## Configuração de autenticação (painel do Supabase)

Aplicar em produção e em staging:

- Auth → Email: "Confirm email" ligado.
- Password: mínimo de 10 caracteres, com letras e dígitos.
- "Leaked password protection" ligado (requer plano Pro; senão, fica anotado para a Fase 6).
- Site URL e Redirect URLs só com `https://projeta.richardvieira.com.br` e o domínio de preview da Vercel.
- Rate limits de e-mail revisados.
