-- Fase 5, tarefa 1: atas de reunião e ações, com RLS por projeto e salvamento
-- transacional.
--
-- O documento da ata (content) é a fonte da verdade; meeting_actions é a
-- projeção das ações para consulta. As duas tabelas seguem a regra da Fase 1:
--   select:                  project_id in (select private.project_ids_with_role('viewer'))
--   insert, update e delete: o mesmo com 'editor'.
--
-- Escrita:
--   meeting_minutes  pela RPC public.save_meeting_minute (SECURITY INVOKER: a
--                    RLS vale para o upsert da ata) ou direto pelo cliente.
--   meeting_actions  só pela RPC. O cliente tem apenas SELECT; a RPC grava as
--                    ações por private.write_meeting_actions (SECURITY DEFINER),
--                    que confere de novo o papel de editor e a ata antes de
--                    escrever.

-- ─── meeting_minutes ────────────────────────────────────────────────────────

create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  title text not null default '' check (char_length(title) <= 200),
  meeting_at timestamp without time zone,
  location text not null default '' check (char_length(location) <= 200),
  participants text not null default '' check (char_length(participants) <= 2000),
  template text not null default 'blank' check (template in ('status', 'kickoff', 'daily', 'blank')),
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
    check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 500000),
  content_text text not null default '' check (char_length(content_text) <= 20000),
  search_tsv tsvector generated always as (
    to_tsvector('portuguese'::regconfig, coalesce(title, '') || ' ' || coalesce(content_text, ''))
  ) stored,
  -- Sem FK para auth.users: um ON DELETE SET NULL seria um UPDATE barrado pelo
  -- trigger que torna created_by imutável.
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade
);

create index if not exists meeting_minutes_project_meeting_at_idx
  on public.meeting_minutes (project_id, meeting_at desc);
create index if not exists meeting_minutes_search_tsv_idx
  on public.meeting_minutes using gin (search_tsv);

-- ─── meeting_actions ────────────────────────────────────────────────────────

create table if not exists public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  minute_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  description text not null default '' check (char_length(description) <= 1000),
  owner_name text not null default '' check (char_length(owner_name) <= 200),
  due_date date,
  status text not null default 'aberta' check (status in ('aberta', 'concluída', 'cancelada')),
  task_id uuid,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (minute_id, project_id)
    references public.meeting_minutes (id, project_id) on delete cascade,
  -- Ao apagar a tarefa, só task_id vira null; a ação fica (como em anomalies).
  constraint meeting_actions_task_same_project_fkey
    foreign key (task_id, project_id)
    references public.tasks (id, project_id) on delete set null (task_id)
);

create index if not exists meeting_actions_project_status_due_idx
  on public.meeting_actions (project_id, status, due_date);
create index if not exists meeting_actions_minute_id_idx
  on public.meeting_actions (minute_id, project_id);
create index if not exists meeting_actions_task_id_idx
  on public.meeting_actions (task_id)
  where task_id is not null;

-- ─── triggers da Fase 1 ─────────────────────────────────────────────────────

drop trigger if exists meeting_minutes_stamp_created_at on public.meeting_minutes;
create trigger meeting_minutes_stamp_created_at before insert on public.meeting_minutes
for each row execute function private.stamp_created_at();

drop trigger if exists meeting_minutes_forbid_column_changes on public.meeting_minutes;
create trigger meeting_minutes_forbid_column_changes before update on public.meeting_minutes
for each row execute function private.forbid_column_changes('workspace_id', 'project_id', 'created_by', 'created_at');

drop trigger if exists meeting_minutes_set_updated_at on public.meeting_minutes;
create trigger meeting_minutes_set_updated_at before update on public.meeting_minutes
for each row execute function private.set_updated_at();

drop trigger if exists meeting_actions_stamp_created_at on public.meeting_actions;
create trigger meeting_actions_stamp_created_at before insert on public.meeting_actions
for each row execute function private.stamp_created_at();

drop trigger if exists meeting_actions_forbid_column_changes on public.meeting_actions;
create trigger meeting_actions_forbid_column_changes before update on public.meeting_actions
for each row execute function private.forbid_column_changes('workspace_id', 'project_id', 'minute_id', 'created_at');

drop trigger if exists meeting_actions_set_updated_at on public.meeting_actions;
create trigger meeting_actions_set_updated_at before update on public.meeting_actions
for each row execute function private.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.meeting_minutes enable row level security;
alter table public.meeting_minutes force row level security;
alter table public.meeting_actions enable row level security;
alter table public.meeting_actions force row level security;

drop policy if exists meeting_minutes_viewer_select on public.meeting_minutes;
create policy meeting_minutes_viewer_select on public.meeting_minutes
  for select to authenticated
  using (project_id in (select private.project_ids_with_role('viewer')));

-- created_by tem default auth.uid(); o cliente não grava outro autor.
drop policy if exists meeting_minutes_editor_insert on public.meeting_minutes;
create policy meeting_minutes_editor_insert on public.meeting_minutes
  for insert to authenticated
  with check (
    project_id in (select private.project_ids_with_role('editor'))
    and created_by = (select auth.uid())
  );

drop policy if exists meeting_minutes_editor_update on public.meeting_minutes;
create policy meeting_minutes_editor_update on public.meeting_minutes
  for update to authenticated
  using (project_id in (select private.project_ids_with_role('editor')))
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists meeting_minutes_editor_delete on public.meeting_minutes;
create policy meeting_minutes_editor_delete on public.meeting_minutes
  for delete to authenticated
  using (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists meeting_actions_viewer_select on public.meeting_actions;
create policy meeting_actions_viewer_select on public.meeting_actions
  for select to authenticated
  using (project_id in (select private.project_ids_with_role('viewer')));

-- Segunda camada: hoje authenticated não tem INSERT/UPDATE/DELETE em
-- meeting_actions (42501 antes da RLS). Se um grant de escrita aparecer por
-- engano, a regra padrão continua valendo.
drop policy if exists meeting_actions_editor_insert on public.meeting_actions;
create policy meeting_actions_editor_insert on public.meeting_actions
  for insert to authenticated
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists meeting_actions_editor_update on public.meeting_actions;
create policy meeting_actions_editor_update on public.meeting_actions
  for update to authenticated
  using (project_id in (select private.project_ids_with_role('editor')))
  with check (project_id in (select private.project_ids_with_role('editor')));

drop policy if exists meeting_actions_editor_delete on public.meeting_actions;
create policy meeting_actions_editor_delete on public.meeting_actions
  for delete to authenticated
  using (project_id in (select private.project_ids_with_role('editor')));

-- ─── grants ─────────────────────────────────────────────────────────────────

-- O Supabase concede ALL (até TRUNCATE) a anon e authenticated em toda tabela
-- nova do schema public.
revoke all on table public.meeting_minutes from public, anon, authenticated;
grant select, insert, update, delete on table public.meeting_minutes to authenticated;
grant all on table public.meeting_minutes to service_role;

revoke all on table public.meeting_actions from public, anon, authenticated;
grant select on table public.meeting_actions to authenticated;
grant all on table public.meeting_actions to service_role;

-- ─── escrita das ações ──────────────────────────────────────────────────────

-- Reescreve as ações de uma ata a partir de p_actions (lista, em ordem de
-- documento). SECURITY DEFINER porque authenticated só lê meeting_actions; por
-- isso confere de novo, com o auth.uid() do chamador, que ele é editor do
-- projeto e que a ata existe nesse projeto e workspace.
create or replace function private.write_meeting_actions(
  p_minute_id uuid,
  p_project_id uuid,
  p_workspace_id uuid,
  p_actions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actions jsonb := coalesce(p_actions, '[]'::jsonb);
begin
  if not coalesce(p_project_id in (select private.project_ids_with_role('editor')), false) then
    raise exception 'sem permissão para gravar ações neste projeto' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.meeting_minutes m
     where m.id = p_minute_id
       and m.project_id = p_project_id
       and m.workspace_id = p_workspace_id
  ) then
    raise exception 'ata não encontrada neste projeto' using errcode = '42501';
  end if;

  if jsonb_typeof(actions) <> 'array' then
    raise exception 'p_actions deve ser uma lista' using errcode = '22023';
  end if;

  -- <> all(array(...)) com array vazio é verdadeiro: zero ações apaga todas.
  -- (not in com lista vazia ou com nulo não apagaria nada.)
  delete from public.meeting_actions ma
   where ma.minute_id = p_minute_id
     and ma.id <> all(array(
       select (e.value ->> 'id')::uuid
         from jsonb_array_elements(actions) as e(value)
        where e.value ->> 'id' is not null
     ));

  -- Um id que já pertence a outra ata (bloco colado sem id novo) não é
  -- sequestrado: o WHERE do DO UPDATE descarta a linha em silêncio.
  insert into public.meeting_actions (
    id, minute_id, project_id, workspace_id,
    description, owner_name, due_date, status, task_id, position
  )
  select
    (a.value ->> 'id')::uuid,
    p_minute_id,
    p_project_id,
    p_workspace_id,
    coalesce(a.value ->> 'description', ''),
    coalesce(a.value ->> 'owner_name', ''),
    nullif(a.value ->> 'due_date', '')::date,
    coalesce(nullif(a.value ->> 'status', ''), 'aberta'),
    nullif(a.value ->> 'task_id', '')::uuid,
    a.ordinality::int
  from jsonb_array_elements(actions) with ordinality as a(value, ordinality)
  on conflict (id) do update set
    description = excluded.description,
    owner_name = excluded.owner_name,
    due_date = excluded.due_date,
    status = excluded.status,
    task_id = excluded.task_id,
    position = excluded.position
  where public.meeting_actions.minute_id = excluded.minute_id;
end;
$$;

revoke all on function private.write_meeting_actions(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function private.write_meeting_actions(uuid, uuid, uuid, jsonb) to authenticated;

-- ─── RPC de salvamento ──────────────────────────────────────────────────────

-- Salva a ata e reescreve as ações numa transação só. SECURITY INVOKER: o
-- upsert da ata passa pela RLS de meeting_minutes (viewer e estranho levam
-- 42501). created_by e created_at nunca vêm do payload. workspace_id e
-- project_id entram no DO UPDATE de propósito: se diferirem da ata gravada, o
-- trigger forbid_column_changes recusa (a ata não muda de projeto).
create or replace function public.save_meeting_minute(p_minute jsonb, p_actions jsonb)
returns public.meeting_minutes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.meeting_minutes;
begin
  insert into public.meeting_minutes (
    id, workspace_id, project_id, title, meeting_at, location, participants,
    template, content, content_text
  )
  values (
    (p_minute ->> 'id')::uuid,
    (p_minute ->> 'workspace_id')::uuid,
    (p_minute ->> 'project_id')::uuid,
    coalesce(p_minute ->> 'title', ''),
    nullif(p_minute ->> 'meeting_at', '')::timestamp,
    coalesce(p_minute ->> 'location', ''),
    coalesce(p_minute ->> 'participants', ''),
    coalesce(nullif(p_minute ->> 'template', ''), 'blank'),
    coalesce(nullif(p_minute -> 'content', 'null'::jsonb), '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb),
    coalesce(p_minute ->> 'content_text', '')
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    project_id = excluded.project_id,
    title = excluded.title,
    meeting_at = excluded.meeting_at,
    location = excluded.location,
    participants = excluded.participants,
    template = excluded.template,
    content = excluded.content,
    content_text = excluded.content_text
  returning * into saved;

  perform private.write_meeting_actions(saved.id, saved.project_id, saved.workspace_id, p_actions);

  return saved;
end;
$$;

revoke all on function public.save_meeting_minute(jsonb, jsonb) from public, anon;
grant execute on function public.save_meeting_minute(jsonb, jsonb) to authenticated;
