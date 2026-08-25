-- Restore the privileges required by workspace RLS policies.
-- The policies call these SECURITY DEFINER helpers as authenticated users.

grant usage on schema private to authenticated;

grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

revoke execute on function private.is_workspace_member(uuid) from anon, public;
revoke execute on function private.is_workspace_owner(uuid) from anon, public;
