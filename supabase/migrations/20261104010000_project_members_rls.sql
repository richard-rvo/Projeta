-- Fase 1, tarefa 3: papel por projeto (S3) e FK de anomalia no mesmo projeto (S12).
--
-- S3:  projetos, tarefas e anomalias eram visíveis e graváveis por qualquer
--      membro do workspace. Agora o acesso é por projeto, com papel
--      owner > editor > viewer em project_members. Hoje só existe a linha do
--      dono (trigger e backfill); a tabela já está pronta para equipes.
-- S12: anomalies.task_id aceitava tarefa de outro projeto. A FK passa a ser
--      composta (task_id, project_id) e, ao apagar a tarefa, só task_id vira null.
--
-- A regra que toda tabela de projeto futura copia:
--   select:                  project_id in (select private.project_ids_with_role('viewer'))
--   insert, update e delete: o mesmo com 'editor'.

-- ─── projects.owner_id ──────────────────────────────────────────────────────

alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update public.projects p
   set owner_id = w.owner_id
  from public.workspaces w
 where w.id = p.workspace_id
   and p.owner_id is null;

alter table public.projects
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

create index if not exists projects_owner_id_idx on public.projects (owner_id);

-- O dono do projeto é tão imutável quanto o workspace e o created_at.
drop trigger if exists projects_forbid_column_changes on public.projects;
create trigger projects_forbid_column_changes before update on public.projects
for each row execute function private.forbid_column_changes('workspace_id', 'owner_id', 'created_at');

-- ─── project_members ────────────────────────────────────────────────────────

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

alter table public.project_members enable row level security;
alter table public.project_members force row level security;

-- O Supabase concede ALL (até TRUNCATE) a anon e authenticated em toda tabela
-- nova do schema public. Vínculos só entram por código SECURITY DEFINER.
revoke all on table public.project_members from public, anon, authenticated;
grant select on table public.project_members to authenticated;
grant all on table public.project_members to service_role;

insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'owner'
  from public.projects
on conflict do nothing;

-- ─── papel do chamador ──────────────────────────────────────────────────────

-- Projetos em que o chamador tem papel >= min_role (viewer < editor < owner).
-- Papel desconhecido em min_role devolve nenhuma linha. SECURITY DEFINER lê
-- project_members sem passar pela própria policy (o dono da função tem
-- BYPASSRLS), então a policy de project_members pode chamá-la sem recursão.
create or replace function private.project_ids_with_role(min_role text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pm.project_id
    from public.project_members pm
   where pm.user_id = (select auth.uid())
     and (case pm.role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 end)
         >= (case min_role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 end);
$$;

revoke execute on function private.project_ids_with_role(text) from public, anon;
grant execute on function private.project_ids_with_role(text) to authenticated;

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or project_id in (select private.project_ids_with_role('owner'))
  );

-- ─── dono entra em project_members ao criar o projeto ───────────────────────

create or replace function private.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function private.add_project_owner();

-- ─── policies de projects ───────────────────────────────────────────────────

drop policy if exists projects_member_access on public.projects;

-- O teste por coluna (owner_id) deixa o INSERT ... RETURNING ler a linha nova:
-- a policy de select é conferida antes do trigger after insert gravar o dono
-- em project_members.
drop policy if exists projects_member_select on public.projects;
create policy projects_member_select on public.projects
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (select private.project_ids_with_role('viewer'))
  );

drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );

drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (select private.project_ids_with_role('editor'))
  )
  with check (
    owner_id = (select auth.uid())
    or id in (select private.project_ids_with_role('editor'))
  );

drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ─── policies de tasks ──────────────────────────────────────────────────────

drop policy if exists tasks_member_access on public.tasks;

drop policy if exists tasks_viewer_select on public.tasks;
create policy tasks_viewer_select on public.tasks
  for select to authenticated
  using (project_id in (select private.project_ids_with_role('viewer')));

drop policy if exists tasks_editor_insert on public.tasks;
create policy tasks_editor_insert on public.tasks
  for insert to authenticated
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists tasks_editor_update on public.tasks;
create policy tasks_editor_update on public.tasks
  for update to authenticated
  using (project_id in (select private.project_ids_with_role('editor')))
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists tasks_editor_delete on public.tasks;
create policy tasks_editor_delete on public.tasks
  for delete to authenticated
  using (project_id in (select private.project_ids_with_role('editor')));

-- ─── policies de anomalies ──────────────────────────────────────────────────

drop policy if exists anomalies_member_access on public.anomalies;

drop policy if exists anomalies_viewer_select on public.anomalies;
create policy anomalies_viewer_select on public.anomalies
  for select to authenticated
  using (project_id in (select private.project_ids_with_role('viewer')));

drop policy if exists anomalies_editor_insert on public.anomalies;
create policy anomalies_editor_insert on public.anomalies
  for insert to authenticated
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists anomalies_editor_update on public.anomalies;
create policy anomalies_editor_update on public.anomalies
  for update to authenticated
  using (project_id in (select private.project_ids_with_role('editor')))
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists anomalies_editor_delete on public.anomalies;
create policy anomalies_editor_delete on public.anomalies
  for delete to authenticated
  using (project_id in (select private.project_ids_with_role('editor')));

-- ─── anomalia só aponta para tarefa do mesmo projeto ────────────────────────

alter table public.tasks
  add constraint tasks_id_project_id_key unique (id, project_id);

-- Vínculos cruzados que já existam perdem só a tarefa; a anomalia fica.
update public.anomalies a
   set task_id = null
 where a.task_id is not null
   and not exists (
     select 1
       from public.tasks t
      where t.id = a.task_id
        and t.project_id = a.project_id
   );

alter table public.anomalies drop constraint if exists anomalies_task_id_fkey;

alter table public.anomalies
  add constraint anomalies_task_same_project_fkey
  foreign key (task_id, project_id)
  references public.tasks (id, project_id)
  on delete set null (task_id);
