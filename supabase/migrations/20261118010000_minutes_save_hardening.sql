-- Fase 5, tarefa 1 (correção): o autosave da ata não pode cair por causa da
-- projeção das ações. O documento (meeting_minutes.content) é a fonte da
-- verdade; meeting_actions só espelha o que dá para consultar.
--
-- 1. description e owner_name chegam sem limite do cliente (texto do bloco e
--    atributo). A tabela recusa > 1000 / > 200 (23514) e derrubava o save
--    inteiro; agora a projeção guarda só o começo.
-- 2. task_id de tarefa já apagada (em outra aba ou aparelho) dava 23503 e
--    derrubava o save; agora vira null. A conferência é no próprio projeto, então
--    tarefa de outro projeto também vira null e nada vaza sobre ela.
-- 3. p_actions nulo apagava todas as ações; agora é recusado (22023), como
--    qualquer valor que não seja lista.
--
-- Mesma assinatura, SECURITY DEFINER e conferências de antes. A RPC
-- public.save_meeting_minute não muda.

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

  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'p_actions deve ser uma lista' using errcode = '22023';
  end if;

  -- <> all(array(...)) com array vazio é verdadeiro: zero ações apaga todas.
  -- (not in com lista vazia ou com nulo não apagaria nada.)
  delete from public.meeting_actions ma
   where ma.minute_id = p_minute_id
     and ma.id <> all(array(
       select (e.value ->> 'id')::uuid
         from jsonb_array_elements(p_actions) as e(value)
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
    left(coalesce(a.value ->> 'description', ''), 1000),
    left(coalesce(a.value ->> 'owner_name', ''), 200),
    nullif(a.value ->> 'due_date', '')::date,
    coalesce(nullif(a.value ->> 'status', ''), 'aberta'),
    (
      select t.id
        from public.tasks t
       where t.id = nullif(a.value ->> 'task_id', '')::uuid
         and t.project_id = p_project_id
    ),
    a.ordinality::int
  from jsonb_array_elements(p_actions) with ordinality as a(value, ordinality)
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
