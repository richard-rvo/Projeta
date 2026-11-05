-- Convites, acesso revogável e administração da plataforma.
--
-- 1. Cadastro só por convite: um trigger BEFORE INSERT em auth.users recusa
--    (invite_required, 42501) quem não tem convite pendente e não expirado. O
--    trigger AFTER INSERT liga o convite ao usuário novo e cria user_access.
--    Login, troca de senha e refresh são UPDATE em auth.users: não passam aqui.
-- 2. Acesso revogável com efeito imediato: as helpers de RLS
--    (project_ids_with_role, is_workspace_member, is_workspace_owner) e as
--    policies de projects que testam owner_id passam a exigir
--    private.is_active_user(). Um JWT ainda válido de quem foi revogado não lê
--    nem grava projetos, tarefas, anomalias, atas ou workspaces.
--    ensure_personal_workspace() responde access_revoked (42501).
-- 3. Administrador da plataforma (private.platform_admins) e RPCs de leitura
--    do admin: métricas agregadas e metadados de conta, nunca o conteúdo dos
--    projetos alheios.
--
-- Escrita em platform_invites e user_access só pelo service role (Edge
-- Function admin-users) ou por código SECURITY DEFINER.
--
-- Ordem importa: o backfill de user_access roda antes de as helpers exigirem
-- is_active_user(), senão os usuários atuais perderiam o acesso.

-- ─── administradores da plataforma ──────────────────────────────────────────

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

revoke all on table private.platform_admins from public, anon, authenticated;

-- ─── convites ───────────────────────────────────────────────────────────────

create table if not exists public.platform_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  sent_count int not null default 0,
  last_sent_at timestamptz,
  last_error text,
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

-- "Expirado" não é status gravado: é pending com expires_at < now().
create unique index if not exists platform_invites_one_pending_per_email
  on public.platform_invites (email)
  where status = 'pending';
create index if not exists platform_invites_accepted_user_id_idx
  on public.platform_invites (accepted_user_id)
  where accepted_user_id is not null;

alter table public.platform_invites enable row level security;
alter table public.platform_invites force row level security;

-- O Supabase concede ALL (até TRUNCATE) a anon e authenticated em toda tabela
-- nova do schema public.
revoke all on table public.platform_invites from public, anon, authenticated;
grant select on table public.platform_invites to authenticated;
grant all on table public.platform_invites to service_role;

-- ─── acesso por usuário ─────────────────────────────────────────────────────

create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  invite_id uuid references public.platform_invites(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists user_access_invite_id_idx
  on public.user_access (invite_id)
  where invite_id is not null;

drop trigger if exists user_access_set_updated_at on public.user_access;
create trigger user_access_set_updated_at before update on public.user_access
for each row execute function private.set_updated_at();

alter table public.user_access enable row level security;
alter table public.user_access force row level security;

revoke all on table public.user_access from public, anon, authenticated;
grant select on table public.user_access to authenticated;
grant all on table public.user_access to service_role;

-- Backfill: todo usuário que já existe continua ativo.
insert into public.user_access (user_id, status)
select u.id, 'active'
  from auth.users u
on conflict (user_id) do nothing;

-- ─── helpers ────────────────────────────────────────────────────────────────

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.platform_admins pa
     where pa.user_id = (select auth.uid())
  );
$$;

-- Sem linha em user_access = sem acesso. Todo usuário ganha a linha no
-- cadastro (trigger abaixo) ou pelo backfill acima.
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_access ua
     where ua.user_id = (select auth.uid())
       and ua.status = 'active'
  );
$$;

revoke execute on function private.is_platform_admin() from public, anon;
revoke execute on function private.is_active_user() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;

-- ─── policies de convites e user_access ─────────────────────────────────────

drop policy if exists platform_invites_admin_select on public.platform_invites;
create policy platform_invites_admin_select on public.platform_invites
  for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists user_access_self_or_admin_select on public.user_access;
create policy user_access_self_or_admin_select on public.user_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

-- ─── cadastro só por convite (auth.users) ───────────────────────────────────

-- Roda como o dono da função (SECURITY DEFINER): o GoTrue insere em auth.users
-- como supabase_auth_admin, que não tem acesso a public.platform_invites.
create or replace function private.enforce_invite_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1
      from public.platform_invites i
     where i.email = lower(new.email)
       and i.status = 'pending'
       and i.expires_at > now()
  ) then
    raise exception 'invite_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.link_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  update public.platform_invites i
     set accepted_user_id = new.id
   where i.email = lower(new.email)
     and i.status = 'pending'
     and i.expires_at > now()
  returning i.id into v_invite_id;

  insert into public.user_access (user_id, status, invite_id)
  values (new.id, 'active', v_invite_id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.enforce_invite_only() from public, anon, authenticated;
revoke all on function private.link_invite_on_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_enforce_invite on auth.users;
create trigger on_auth_user_enforce_invite
  before insert on auth.users
  for each row execute function private.enforce_invite_only();

drop trigger if exists on_auth_user_link_invite on auth.users;
create trigger on_auth_user_link_invite
  after insert on auth.users
  for each row execute function private.link_invite_on_signup();

-- ─── helpers de RLS exigem acesso ativo ─────────────────────────────────────

-- Mesmas assinaturas e corpos de antes, com o teste de acesso ativo.
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
     and (select private.is_active_user())
     and (case pm.role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 end)
         >= (case min_role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 end);
$$;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user())
     and exists (
       select 1
       from public.workspace_members wm
       where wm.workspace_id = $1
         and wm.user_id = (select auth.uid())
     );
$$;

create or replace function private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user())
     and exists (
       select 1
       from public.workspaces w
       where w.id = $1
         and w.owner_id = (select auth.uid())
     );
$$;

-- create or replace mantém as grants; reafirmadas por clareza.
revoke execute on function private.project_ids_with_role(text) from public, anon;
revoke execute on function private.is_workspace_member(uuid) from public, anon;
revoke execute on function private.is_workspace_owner(uuid) from public, anon;
grant execute on function private.project_ids_with_role(text) to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

-- ─── policies que testam auth.uid() direto ──────────────────────────────────

-- projects: o teste por owner_id existe para o INSERT ... RETURNING (ver
-- 20261104010000); ganha o mesmo teste de acesso ativo das helpers.
drop policy if exists projects_member_select on public.projects;
create policy projects_member_select on public.projects
  for select to authenticated
  using (
    (owner_id = (select auth.uid()) and (select private.is_active_user()))
    or id in (select private.project_ids_with_role('viewer'))
  );

drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.is_active_user())
    and (select private.is_workspace_member(workspace_id))
  );

drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects
  for update to authenticated
  using (
    (owner_id = (select auth.uid()) and (select private.is_active_user()))
    or id in (select private.project_ids_with_role('editor'))
  )
  with check (
    (owner_id = (select auth.uid()) and (select private.is_active_user()))
    or id in (select private.project_ids_with_role('editor'))
  );

drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_active_user()));

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.is_active_user()))
    or project_id in (select private.project_ids_with_role('owner'))
  );

-- profiles fica sem o teste: só a própria linha, e o app grava o perfil antes
-- de chamar ensure_personal_workspace (que é quem responde access_revoked).

-- ─── workspace pessoal ──────────────────────────────────────────────────────

-- Igual a 20261104000000, mais: recusa quem não está ativo e, no primeiro
-- acesso, marca como aceito o convite ligado ao usuário.
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

  if not private.is_active_user() then
    raise exception 'access_revoked' using errcode = '42501';
  end if;

  update public.platform_invites i
     set status = 'accepted',
         accepted_at = now()
   where i.accepted_user_id = uid
     and i.status = 'pending';

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

-- ─── RPCs do admin ──────────────────────────────────────────────────────────

-- Qualquer autenticado pergunta; a resposta é só sobre o chamador. INVOKER:
-- quem lê private.platform_admins é a helper SECURITY DEFINER.
create or replace function public.am_i_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select private.is_platform_admin()), false);
$$;

revoke execute on function public.am_i_platform_admin() from public, anon;
grant execute on function public.am_i_platform_admin() to authenticated;

-- SECURITY DEFINER: lê auth.users e as tabelas de todos sem RLS. Só admin.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_users_total int;
  v_users_active int;
  v_pending int;
  v_expired int;
  v_accepted int;
  v_revoked int;
  v_active_7d int;
  v_active_30d int;
begin
  if not coalesce(private.is_platform_admin(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select count(*)::int,
         count(*) filter (where ua.status = 'active')::int,
         count(*) filter (where u.last_sign_in_at >= now() - interval '7 days')::int,
         count(*) filter (where u.last_sign_in_at >= now() - interval '30 days')::int
    into v_users_total, v_users_active, v_active_7d, v_active_30d
    from auth.users u
    left join public.user_access ua on ua.user_id = u.id;

  select count(*) filter (where i.status = 'pending' and i.expires_at >= now())::int,
         count(*) filter (where i.status = 'pending' and i.expires_at < now())::int,
         count(*) filter (where i.status = 'accepted')::int,
         count(*) filter (where i.status = 'revoked')::int
    into v_pending, v_expired, v_accepted, v_revoked
    from public.platform_invites i;

  return jsonb_build_object(
    'users_total', v_users_total,
    'users_active', v_users_active,
    -- Sem linha em user_access conta como revogado (é o que a RLS aplica).
    'users_revoked', v_users_total - v_users_active,
    'invites_pending', v_pending,
    'invites_expired', v_expired,
    'invites_accepted', v_accepted,
    'invites_revoked', v_revoked,
    'acceptance_rate', case
      when v_accepted + v_pending + v_expired = 0 then 0
      else round(v_accepted::numeric / (v_accepted + v_pending + v_expired), 2)
    end,
    'active_7d', v_active_7d,
    'active_30d', v_active_30d,
    'projects', (select count(*)::int from public.projects),
    'tasks', (select count(*)::int from public.tasks),
    'anomalies', (select count(*)::int from public.anomalies),
    'minutes', (select count(*)::int from public.meeting_minutes),
    'actions_open', (select count(*)::int from public.meeting_actions ma where ma.status = 'aberta')
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Contagens dos projetos de que o usuário é dono (projects.owner_id).
-- last_activity_at: maior updated_at entre projetos, tarefas, anomalias e atas
-- dele (greatest ignora nulos). photos_bytes: tamanho serializado das fotos.
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  status text,
  is_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  invited_at timestamptz,
  projects int,
  tasks int,
  anomalies int,
  minutes int,
  last_activity_at timestamptz,
  photos_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not coalesce(private.is_platform_admin(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    pf.display_name,
    coalesce(ua.status, 'revoked'),
    exists (select 1 from private.platform_admins pa where pa.user_id = u.id),
    u.created_at,
    u.last_sign_in_at,
    coalesce(inv.created_at, u.invited_at),
    sp.n,
    st.n,
    sa.n,
    sm.n,
    greatest(sp.last_at, st.last_at, sa.last_at, sm.last_at),
    sa.bytes
  from auth.users u
  left join public.user_access ua on ua.user_id = u.id
  left join public.profiles pf on pf.id = u.id
  left join public.platform_invites inv on inv.id = ua.invite_id
  cross join lateral (
    select count(*)::int as n, max(p.updated_at) as last_at
      from public.projects p
     where p.owner_id = u.id
  ) sp
  cross join lateral (
    select count(*)::int as n, max(t.updated_at) as last_at
      from public.tasks t
      join public.projects p on p.id = t.project_id
     where p.owner_id = u.id
  ) st
  cross join lateral (
    select count(*)::int as n,
           max(a.updated_at) as last_at,
           coalesce(sum(case when a.photos <> '[]'::jsonb then octet_length(a.photos::text) else 0 end), 0)::bigint as bytes
      from public.anomalies a
      join public.projects p on p.id = a.project_id
     where p.owner_id = u.id
  ) sa
  cross join lateral (
    select count(*)::int as n, max(m.updated_at) as last_at
      from public.meeting_minutes m
      join public.projects p on p.id = m.project_id
     where p.owner_id = u.id
  ) sm
  order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
