-- Correção de 20261118030000: "já completou o primeiro acesso" é ter um
-- convite ligado com accepted_at preenchido, não status = 'accepted'. Assim,
-- revogar ou expirar depois um convite já aceito não tranca quem já entrou
-- (revogar quem já entrou é papel de user_access, pela Edge Function).
-- Mesmas assinaturas; só essa condição muda nas três funções.

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
         and i.accepted_at is not null
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
       and i.accepted_at is not null
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
       and i.accepted_at is not null
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
