-- Correções do aceite de convite (revisão da tarefa 1).
--
-- 1. Reconvite: o primeiro acesso só aceitava o convite com accepted_user_id,
--    que só o trigger AFTER INSERT em auth.users grava. Um reconvite para um
--    usuário que já existe e nunca entrou (o GoTrue só reenvia: UPDATE, sem
--    INSERT) ficava pendente para sempre. Agora o primeiro acesso aceita o
--    convite pendente ligado ao usuário ou, sem dono, com o e-mail dele, e
--    user_access.invite_id passa a apontar para ele.
-- 2. Revogar um convite pendente não revogava o convidado cujo usuário já
--    existe (user_access nasce ativo no envio do convite). Agora:
--    a) um trigger em platform_invites revoga o user_access de quem nunca
--       completou o primeiro acesso quando o convite ligado vira 'revoked';
--    b) o primeiro acesso é recusado (access_revoked) quando o convite ligado
--       está revogado ou expirado. Quem já aceitou e quem não tem convite
--       nenhum (o dono, do backfill) não são afetados.
--    Um convite pendente criado depois da revogação vale como nova concessão
--    para quem nunca entrou e reativa o acesso no primeiro acesso; um convite
--    antigo, anterior à revogação, não desfaz a revogação.
-- 3. Status derivado 'invited' (usuário cujo convite ligado ainda não foi
--    aceito) em admin_overview (users_invited) e admin_list_users;
--    is_platform_admin() passa a exigir acesso ativo.

-- ─── admin só com acesso ativo ──────────────────────────────────────────────

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
  )
  and (select private.is_active_user());
$$;

revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- ─── status de acesso para o admin ──────────────────────────────────────────

-- 'active' | 'invited' | 'revoked'. Mesma regra que ensure_personal_workspace
-- aplica no primeiro acesso:
--   active   user_access ativo e o convite ligado já aceito (ou sem convite);
--   invited  user_access ativo e o convite ligado ainda sem accepted_at, ou
--            revogado sem nunca ter aceito mas com convite pendente, válido e
--            criado depois da revogação (reconvite);
--   revoked  o resto, inclusive sem linha em user_access.
create or replace function private.access_status(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when ua.user_id is null then 'revoked'
    when ua.status = 'active' then
      case
        when exists (
          select 1 from public.platform_invites i
           where i.id = ua.invite_id
             and i.accepted_at is null
        ) then 'invited'
        else 'active'
      end
    when not exists (
      select 1 from public.platform_invites i
       where i.accepted_user_id = p_user_id
         and i.status = 'accepted'
    )
    and exists (
      select 1
        from public.platform_invites i
        join auth.users u on u.id = p_user_id
       where i.status = 'pending'
         and i.expires_at > now()
         and (i.accepted_user_id = p_user_id
              or (i.accepted_user_id is null and i.email = lower(u.email)))
         and i.created_at > coalesce(ua.revoked_at, 'infinity'::timestamptz)
    ) then 'invited'
    else 'revoked'
  end
  from (select p_user_id as id) x
  left join public.user_access ua on ua.user_id = x.id;
$$;

revoke all on function private.access_status(uuid) from public, anon, authenticated;

-- ─── convite pendente revogado revoga o convidado ───────────────────────────

-- Só para quem nunca completou o primeiro acesso (nenhum convite aceito) e
-- nunca para um administrador da plataforma.
create or replace function private.revoke_pending_invitee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.platform_invites i
     where i.accepted_user_id = new.accepted_user_id
       and i.status = 'accepted'
  ) or exists (
    select 1 from private.platform_admins pa where pa.user_id = new.accepted_user_id
  ) then
    return new;
  end if;

  update public.user_access ua
     set status = 'revoked',
         revoked_at = now()
   where ua.user_id = new.accepted_user_id
     and ua.status = 'active';

  return new;
end;
$$;

revoke all on function private.revoke_pending_invitee() from public, anon, authenticated;

drop trigger if exists platform_invites_revoke_pending_invitee on public.platform_invites;
create trigger platform_invites_revoke_pending_invitee
  after update of status on public.platform_invites
  for each row
  when (
    new.status = 'revoked'
    and old.status is distinct from 'revoked'
    and new.accepted_user_id is not null
    and new.accepted_at is null
  )
  execute function private.revoke_pending_invitee();

-- ─── primeiro acesso ────────────────────────────────────────────────────────

-- Mesma assinatura e mesmo resultado de antes. No primeiro acesso (nenhum
-- convite aceito por este usuário):
--   * aceita o convite pendente e não expirado ligado ao usuário ou, sem dono,
--     com o e-mail dele; se o acesso estava revogado, só um convite criado
--     depois da revogação o reativa;
--   * sem convite aceitável, mas com convite ligado (revogado ou expirado):
--     access_revoked;
--   * sem convite nenhum (dono do backfill): segue.
create or replace function public.ensure_personal_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_email text;
  v_access public.user_access;
  v_invite_id uuid;
  v_invite_created_at timestamptz;
  result public.workspaces;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.platform_invites i
     where i.accepted_user_id = uid
       and i.status = 'accepted'
  ) then
    select lower(u.email) into v_email from auth.users u where u.id = uid;
    select ua.* into v_access from public.user_access ua where ua.user_id = uid;

    select i.id, i.created_at
      into v_invite_id, v_invite_created_at
      from public.platform_invites i
     where i.status = 'pending'
       and i.expires_at > now()
       and (i.accepted_user_id = uid
            or (i.accepted_user_id is null and i.email = v_email))
     order by i.created_at desc
     limit 1
     for update;

    if v_invite_id is not null
       and (v_access.status = 'active'
            or v_invite_created_at > coalesce(v_access.revoked_at, 'infinity'::timestamptz)) then
      update public.platform_invites i
         set accepted_user_id = uid,
             status = 'accepted',
             accepted_at = now()
       where i.id = v_invite_id;

      insert into public.user_access (user_id, status, invite_id)
      values (uid, 'active', v_invite_id)
      on conflict (user_id) do update
        set status = 'active',
            invite_id = excluded.invite_id,
            revoked_at = null,
            revoked_by = null;
    elsif exists (select 1 from public.platform_invites i where i.accepted_user_id = uid) then
      raise exception 'access_revoked' using errcode = '42501';
    end if;
  end if;

  if not private.is_active_user() then
    raise exception 'access_revoked' using errcode = '42501';
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

-- ─── RPCs do admin com o status derivado ────────────────────────────────────

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
  v_users_invited int;
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
         count(*) filter (where s.status = 'active')::int,
         count(*) filter (where s.status = 'invited')::int,
         count(*) filter (where u.last_sign_in_at >= now() - interval '7 days')::int,
         count(*) filter (where u.last_sign_in_at >= now() - interval '30 days')::int
    into v_users_total, v_users_active, v_users_invited, v_active_7d, v_active_30d
    from auth.users u
    cross join lateral (select private.access_status(u.id) as status) s;

  select count(*) filter (where i.status = 'pending' and i.expires_at >= now())::int,
         count(*) filter (where i.status = 'pending' and i.expires_at < now())::int,
         count(*) filter (where i.status = 'accepted')::int,
         count(*) filter (where i.status = 'revoked')::int
    into v_pending, v_expired, v_accepted, v_revoked
    from public.platform_invites i;

  return jsonb_build_object(
    'users_total', v_users_total,
    'users_active', v_users_active,
    'users_invited', v_users_invited,
    'users_revoked', v_users_total - v_users_active - v_users_invited,
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

-- status: 'active' | 'invited' | 'revoked' (private.access_status).
-- photos_bytes é aproximado: tamanho do jsonb serializado das fotos (base64 e
-- metadados), não o tamanho dos arquivos de imagem.
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
    private.access_status(u.id),
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
    -- Aproximado: octet_length do jsonb serializado (ver comentário acima).
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
