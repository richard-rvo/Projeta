-- Fase 1, tarefa 2: endurecer workspaces, membros e perfis.
--
-- S1: qualquer dono podia inserir qualquer usuário como membro do próprio
--     workspace (e o usuário passava a ver tudo que é dele). Membros agora só
--     entram por código SECURITY DEFINER (trigger de dono, RPCs futuras).
-- S2: o dono podia transferir owner_id para outra pessoa. As grants por coluna
--     limitam o UPDATE a name e timezone; o plano também fica fora do alcance.
-- O workspace pessoal passa a nascer pela RPC ensure_personal_workspace(), que
-- também conserta o primeiro acesso (insert ... select falhava com 42501).
-- A anon recebe as mesmas revogações que authenticated: o Supabase concede
-- privilégios de tabela às duas por padrão.

-- ─── workspace_members ──────────────────────────────────────────────────────

drop policy if exists workspace_members_owner_manage on public.workspace_members;
revoke insert, update, delete on public.workspace_members from anon, authenticated;

-- ─── workspaces ─────────────────────────────────────────────────────────────

alter table public.workspaces
  add column if not exists is_personal boolean not null default false,
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro'));

-- O workspace mais antigo de cada dono é o pessoal.
update public.workspaces w
   set is_personal = true
  from (
    select distinct on (owner_id) id
      from public.workspaces
     order by owner_id, created_at, id
  ) oldest
 where w.id = oldest.id
   and not exists (
     select 1 from public.workspaces p where p.owner_id = w.owner_id and p.is_personal
   );

create unique index if not exists workspaces_one_personal_per_owner
  on public.workspaces (owner_id)
  where is_personal;

drop policy if exists workspaces_owner_insert on public.workspaces;
revoke insert on public.workspaces from anon, authenticated;

revoke update on public.workspaces from anon, authenticated;
grant update (name, timezone) on public.workspaces to authenticated;

drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces
  for update to authenticated
  using ((select private.is_workspace_owner(id)))
  with check (owner_id = (select auth.uid()));

-- ─── colunas imutáveis e created_at do servidor ─────────────────────────────

-- Recebe os nomes das colunas em TG_ARGV e recusa o UPDATE que mudar alguma.
create or replace function private.forbid_column_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if (new_row -> col) is distinct from (old_row -> col) then
      raise exception '% não pode ser alterado', col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.stamp_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists projects_stamp_created_at on public.projects;
create trigger projects_stamp_created_at before insert on public.projects
for each row execute function private.stamp_created_at();

drop trigger if exists tasks_stamp_created_at on public.tasks;
create trigger tasks_stamp_created_at before insert on public.tasks
for each row execute function private.stamp_created_at();

drop trigger if exists anomalies_stamp_created_at on public.anomalies;
create trigger anomalies_stamp_created_at before insert on public.anomalies
for each row execute function private.stamp_created_at();

drop trigger if exists projects_forbid_column_changes on public.projects;
create trigger projects_forbid_column_changes before update on public.projects
for each row execute function private.forbid_column_changes('workspace_id', 'created_at');

drop trigger if exists tasks_forbid_column_changes on public.tasks;
create trigger tasks_forbid_column_changes before update on public.tasks
for each row execute function private.forbid_column_changes('workspace_id', 'project_id', 'created_at');

drop trigger if exists anomalies_forbid_column_changes on public.anomalies;
create trigger anomalies_forbid_column_changes before update on public.anomalies
for each row execute function private.forbid_column_changes('workspace_id', 'project_id', 'created_at');

-- ─── workspace pessoal ──────────────────────────────────────────────────────

-- Idempotente: cria o workspace pessoal do chamador se ainda não existir e o
-- devolve. Só olha owner_id = chamador e is_personal, nunca outros vínculos.
create or replace function public.ensure_personal_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result public.workspaces;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.workspaces (name, owner_id, is_personal)
  values (
    coalesce(
      nullif(trim((select p.display_name from public.profiles p where p.id = uid)), ''),
      'Meu'
    ) || ' workspace',
    uid,
    true
  )
  on conflict (owner_id) where is_personal do nothing;

  select w.* into result
    from public.workspaces w
   where w.owner_id = uid
     and w.is_personal;

  return result;
end;
$$;

revoke execute on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

-- ─── profiles ───────────────────────────────────────────────────────────────

-- FOR ALL incluía DELETE; agora só leitura, criação e edição do próprio perfil.
drop policy if exists profiles_self_access on public.profiles;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
