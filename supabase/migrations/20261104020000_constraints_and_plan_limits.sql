-- Fase 1, tarefa 4: restrições de domínio, limites de tamanho e limite de
-- projetos por plano (S4, S5).
-- Cada constraint é precedida da limpeza dos dados existentes, senão o
-- ADD CONSTRAINT falharia em bases com linhas fora do domínio.

-- ─── domínio ────────────────────────────────────────────────────────────────

update public.projects set status = 'Planejado'
 where status not in ('Planejado', 'Em Andamento', 'Concluído', 'Pausado');
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('Planejado', 'Em Andamento', 'Concluído', 'Pausado'));

update public.anomalies set status = 'aberta'
 where status not in ('aberta', 'em análise', 'resolvida', 'cancelada');
alter table public.anomalies drop constraint if exists anomalies_status_check;
alter table public.anomalies add constraint anomalies_status_check
  check (status in ('aberta', 'em análise', 'resolvida', 'cancelada'));

update public.anomalies set severity = null
 where severity is not null and severity not in ('baixa', 'média', 'alta', 'crítica');
alter table public.anomalies drop constraint if exists anomalies_severity_check;
alter table public.anomalies add constraint anomalies_severity_check
  check (severity is null or severity in ('baixa', 'média', 'alta', 'crítica'));

-- ─── tamanhos de texto ──────────────────────────────────────────────────────

update public.projects set name = left(name, 200) where char_length(name) > 200;
alter table public.projects drop constraint if exists projects_name_length_check;
alter table public.projects add constraint projects_name_length_check
  check (char_length(name) <= 200);

update public.projects set description = left(description, 5000) where char_length(description) > 5000;
alter table public.projects drop constraint if exists projects_description_length_check;
alter table public.projects add constraint projects_description_length_check
  check (char_length(description) <= 5000);

update public.tasks set name = left(name, 500) where char_length(name) > 500;
alter table public.tasks drop constraint if exists tasks_name_length_check;
alter table public.tasks add constraint tasks_name_length_check
  check (char_length(name) <= 500);

update public.anomalies set title = left(title, 300) where char_length(title) > 300;
alter table public.anomalies drop constraint if exists anomalies_title_length_check;
alter table public.anomalies add constraint anomalies_title_length_check
  check (char_length(title) <= 300);

update public.anomalies set description = left(description, 10000) where char_length(description) > 10000;
alter table public.anomalies drop constraint if exists anomalies_description_length_check;
alter table public.anomalies add constraint anomalies_description_length_check
  check (char_length(description) <= 10000);

-- ─── tamanhos de jsonb (octet_length do texto serializado) ──────────────────

update public.anomalies set photos = '[]'::jsonb where octet_length(photos::text) > 3000000;
alter table public.anomalies drop constraint if exists anomalies_photos_size_check;
alter table public.anomalies add constraint anomalies_photos_size_check
  check (octet_length(photos::text) <= 3000000);

update public.projects set metadata = '{}'::jsonb where octet_length(metadata::text) > 100000;
alter table public.projects drop constraint if exists projects_metadata_size_check;
alter table public.projects add constraint projects_metadata_size_check
  check (octet_length(metadata::text) <= 100000);

update public.tasks set metadata = '{}'::jsonb where octet_length(metadata::text) > 100000;
alter table public.tasks drop constraint if exists tasks_metadata_size_check;
alter table public.tasks add constraint tasks_metadata_size_check
  check (octet_length(metadata::text) <= 100000);

update public.anomalies set metadata = '{}'::jsonb where octet_length(metadata::text) > 100000;
alter table public.anomalies drop constraint if exists anomalies_metadata_size_check;
alter table public.anomalies add constraint anomalies_metadata_size_check
  check (octet_length(metadata::text) <= 100000);

-- ─── limite de projetos por plano ───────────────────────────────────────────

create table if not exists private.plan_limits (
  plan text primary key,
  max_projects int not null check (max_projects > 0)
);
revoke all on private.plan_limits from anon, authenticated;

insert into private.plan_limits (plan, max_projects)
values ('free', 10), ('pro', 200)
on conflict (plan) do update set max_projects = excluded.max_projects;

-- Dispara também no INSERT ... ON CONFLICT DO UPDATE (o upsert do app) mesmo
-- quando a linha já existe: nesse caso não conta nada.
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

  select coalesce(
           (select pl.max_projects from private.plan_limits pl where pl.plan = w.plan),
           (select pl.max_projects from private.plan_limits pl where pl.plan = 'free')
         )
    into max_allowed
    from public.workspaces w
   where w.id = new.workspace_id;

  -- Workspace inexistente: a FK/RLS rejeitam; não é papel deste gatilho.
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

drop trigger if exists projects_enforce_limit on public.projects;
create trigger projects_enforce_limit before insert on public.projects
for each row execute function private.enforce_project_limit();
