-- Correção imediata do erro 42501:
-- permission denied for function is_workspace_member
--
-- Execute no Supabase SQL Editor como administrador/postgres.

begin;

grant usage on schema private to authenticated;

grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

-- Estas funções são chamadas pelas policies e não devem ficar disponíveis
-- para usuários anônimos ou para o papel PUBLIC.
revoke execute on function private.is_workspace_member(uuid) from anon, public;
revoke execute on function private.is_workspace_owner(uuid) from anon, public;

commit;

-- Verificação: as duas linhas devem retornar grantee = authenticated.
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'private'
  and routine_name in ('is_workspace_member', 'is_workspace_owner')
  and grantee = 'authenticated'
order by routine_name;
