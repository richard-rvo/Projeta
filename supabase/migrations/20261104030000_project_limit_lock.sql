-- Fase 1, tarefa 4 (correção): serializa o limite de projetos por workspace.
-- Sem o lock, dois INSERTs concorrentes liam o mesmo count(*) (READ COMMITTED)
-- e ambos passavam do limite.
create or replace function private.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_allowed int;
  current_count int;
begin
  if exists (select 1 from public.projects where id = new.id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  select coalesce(
           (select pl.max_projects from private.plan_limits pl where pl.plan = w.plan),
           (select pl.max_projects from private.plan_limits pl where pl.plan = 'free')
         )
    into max_allowed
    from public.workspaces w
   where w.id = new.workspace_id;

  if max_allowed is null then
    return new;
  end if;

  select count(*) into current_count
    from public.projects
   where workspace_id = new.workspace_id;

  if current_count >= max_allowed then
    raise exception 'plan_limit_projects' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_project_limit() from public, anon, authenticated;
