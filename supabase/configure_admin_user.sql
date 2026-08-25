-- Projeta: configura um usuário proprietário (admin) do workspace.
--
-- Execute no SQL Editor do Supabase com uma sessão administrativa.
-- Troque apenas os valores abaixo antes de executar.
--
-- No schema atual não existe um admin global: o nível administrativo é o
-- proprietário (owner) de um workspace. Este script não altera senha,
-- e-mail ou qualquer credencial em auth.users.

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

  -- Garante o perfil público mesmo se o trigger de criação não tiver sido
  -- executado ou se o usuário tiver sido criado fora do fluxo do aplicativo.
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(nullif(trim(v_display_name), ''), v_email))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  -- Reutiliza um workspace que o usuário já possui. Caso ainda não exista,
  -- cria um workspace próprio; o trigger do schema cria o membership owner.
  select id
    into v_workspace_id
    from public.workspaces
   where owner_id = v_user_id
   order by created_at asc
   limit 1;

  if v_workspace_id is null then
    insert into public.workspaces (name, owner_id)
    values (coalesce(nullif(trim(v_workspace_name), ''), 'Projeta'), v_user_id)
    returning id into v_workspace_id;
  else
    update public.workspaces
       set name = coalesce(nullif(trim(v_workspace_name), ''), name),
           updated_at = now()
     where id = v_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id) do update
    set role = 'owner';

  raise notice 'Usuário % configurado como owner do workspace % (%).',
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
  wm.role
from auth.users u
join public.workspace_members wm on wm.user_id = u.id
join public.workspaces w on w.id = wm.workspace_id
where lower(u.email) = lower('admin@exemplo.com');
