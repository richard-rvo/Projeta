-- Projeta: configura o administrador da plataforma e o workspace dele.
--
-- Execute no SQL Editor do Supabase com uma sessão administrativa.
-- Troque apenas os valores abaixo antes de executar.
--
-- O administrador da plataforma é quem está em private.platform_admins: vê a
-- página Administração (convites, usuários, uso) e não pode ser revogado pela
-- Edge Function admin-users. Este script também garante o acesso ativo
-- (public.user_access) e o workspace pessoal. Não altera senha, e-mail ou
-- qualquer credencial em auth.users.
--
-- O usuário precisa existir em auth.users. Com o cadastro só por convite, um
-- usuário novo só nasce com convite pendente em public.platform_invites.
--
-- Notas do modelo atual:
--   * O workspace criado aqui é o pessoal (is_personal = true); só pode existir
--     um por dono. O membership owner vem do trigger on_workspace_created do
--     schema base: este script não insere em workspace_members.
--   * Projetos têm owner_id (NOT NULL). No app ele vem de auth.uid(); no SQL
--     Editor auth.uid() é nulo, então qualquer INSERT manual em public.projects
--     deve passar owner_id explicitamente. O trigger on_project_created grava o
--     vínculo owner em project_members.
--   * Mudanças de schema ou de permissão entram como migração em
--     supabase/migrations/, nunca como correção avulsa no SQL Editor.

do $$
declare
  v_email text := 'admin@exemplo.com';
  v_display_name text := 'Administrador Projeta';
  v_workspace_name text := 'Projeta';
  v_user_id uuid;
  v_workspace_id uuid;
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower(trim(v_email))
   limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado para o e-mail: %', v_email;
  end if;

  -- Administrador da plataforma e acesso ativo (idempotente).
  insert into private.platform_admins (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  insert into public.user_access (user_id, status)
  values (v_user_id, 'active')
  on conflict (user_id) do update
    set status = 'active',
        revoked_at = null,
        revoked_by = null;

  -- Garante o perfil público mesmo se o trigger de criação não tiver sido
  -- executado ou se o usuário tiver sido criado fora do fluxo do aplicativo.
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(nullif(trim(v_display_name), ''), v_email))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  -- Reutiliza o workspace pessoal do usuário. Caso ainda não exista,
  -- cria um; o trigger do schema cria o membership owner.
  select id
    into v_workspace_id
    from public.workspaces
   where owner_id = v_user_id
     and is_personal
   limit 1;

  if v_workspace_id is null then
    insert into public.workspaces (name, owner_id, is_personal)
    values (coalesce(nullif(trim(v_workspace_name), ''), 'Projeta'), v_user_id, true)
    returning id into v_workspace_id;
  else
    update public.workspaces
       set name = coalesce(nullif(trim(v_workspace_name), ''), name),
           updated_at = now()
     where id = v_workspace_id;
  end if;

  raise notice 'Usuário % configurado como administrador da plataforma e owner do workspace % (%).',
    v_email, v_workspace_name, v_workspace_id;
end
$$;

-- Verificação pós-execução. Não retorna senha nem token.
-- Use o mesmo e-mail definido em v_email acima.
select
  u.id,
  u.email,
  u.email_confirmed_at,
  w.id as workspace_id,
  w.name as workspace_name,
  w.owner_id,
  w.is_personal,
  wm.role,
  ua.status as access_status,
  exists (select 1 from private.platform_admins pa where pa.user_id = u.id) as is_platform_admin
from auth.users u
join public.workspace_members wm on wm.user_id = u.id
join public.workspaces w on w.id = wm.workspace_id
left join public.user_access ua on ua.user_id = u.id
where lower(u.email) = lower('admin@exemplo.com');
