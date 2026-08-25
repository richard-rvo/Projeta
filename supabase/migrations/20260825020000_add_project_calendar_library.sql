-- Calendários por projeto e atribuição opcional por tarefa.
-- Esta migração é segura para instalações que já receberam o schema
-- inicial e também para bases anteriores a esse recurso.

alter table public.projects
  add column if not exists calendars jsonb not null default '[]'::jsonb,
  add column if not exists default_calendar_id text,
  add column if not exists calendar_settings jsonb not null default '{"durationDisplay":"auto"}'::jsonb;

alter table public.tasks
  add column if not exists calendar_id text;

-- Projetos antigos recebem a mesma jornada que a aplicação usa como padrão.
-- A tarefa sem calendar_id continua herdando esse calendário do projeto.
update public.projects
set
  calendars = case
    when jsonb_typeof(calendars) = 'array' and jsonb_array_length(calendars) > 0 then calendars
    else jsonb_build_array(jsonb_build_object(
      'id', 'padrao',
      'name', 'Padrão',
      'workdays', jsonb_build_array(1, 2, 3, 4, 5),
      'shifts', jsonb_build_array(
        jsonb_build_object('from', '08:00', 'to', '12:00'),
        jsonb_build_object('from', '13:00', 'to', '17:00')
      ),
      'holidays', '[]'::jsonb
    ))
  end,
  default_calendar_id = coalesce(nullif(default_calendar_id, ''), 'padrao'),
  calendar_settings = coalesce(calendar_settings, '{"durationDisplay":"auto"}'::jsonb);
