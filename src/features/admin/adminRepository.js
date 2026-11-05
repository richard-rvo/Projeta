import { friendlyError, requireClient, throwIfError, toFriendlyError } from '../../utils/supabaseRepository';

/** Status de exibição: "expirado" é derivado de pendente + prazo vencido. */
export function inviteDisplayStatus(invite, now = Date.now()) {
  if (invite.status === 'pending' && invite.expires_at && new Date(invite.expires_at).getTime() < now) {
    return 'expired';
  }
  return invite.status;
}

/** Falha ao consultar nunca vira "não é admin" com erro: quem chama decide. */
export async function amIPlatformAdmin() {
  const result = await requireClient().rpc('am_i_platform_admin');
  return throwIfError(result) === true;
}

export async function getAdminOverview() {
  const result = await requireClient().rpc('admin_overview');
  try {
    return throwIfError(result) || {};
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function listAdminUsers() {
  const result = await requireClient().rpc('admin_list_users');
  try {
    return throwIfError(result) || [];
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function listInvites() {
  const result = await requireClient()
    .from('platform_invites')
    .select('*')
    .order('created_at', { ascending: false });
  let rows;
  try {
    rows = throwIfError(result) || [];
  } catch (error) {
    throw toFriendlyError(error);
  }
  const now = Date.now();
  return rows.map((row) => ({ ...row, display_status: inviteDisplayStatus(row, now) }));
}

async function messageFromInvokeError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error?.message) return body.error.message;
  } catch { /* corpo ilegível: cai na mensagem genérica */ }
  return null;
}

/** Chama a Edge Function `admin-users`. Devolve `data` ou lança erro em português. */
export async function adminAction(action, payload = {}) {
  const client = requireClient();
  let response;
  try {
    response = await client.functions.invoke('admin-users', { body: { action, ...payload } });
  } catch (error) {
    throw toFriendlyError(error);
  }
  const { data, error } = response || {};
  if (error) {
    const message = await messageFromInvokeError(error);
    throw message ? friendlyError(message) : toFriendlyError(error);
  }
  if (data && data.ok === false) {
    throw friendlyError(data.error?.message || 'Não foi possível concluir a operação. Tente de novo.');
  }
  return data?.data;
}
