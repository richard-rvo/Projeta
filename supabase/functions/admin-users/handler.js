// Lógica da Edge Function admin-users. ESM puro: clientes injetados, sem Deno.* aqui.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BAN_FOREVER = '876000h';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG = {
  unauthorized: 'Sessão ausente ou expirada. Entre novamente.',
  forbidden: 'Apenas administradores da plataforma podem fazer isto.',
  method: 'Método não permitido.',
  badJson: 'Requisição inválida.',
  badAction: 'Ação desconhecida.',
  badEmail: 'Informe um e-mail válido.',
  badNote: 'A observação deve ter no máximo 500 caracteres.',
  badId: 'Identificador inválido.',
  userExists: 'Este e-mail já tem uma conta. Use "Restaurar" se o acesso foi revogado.',
  sendFailed: 'Não foi possível enviar o e-mail do convite. Tente novamente em instantes.',
  inviteNotFound: 'Convite não encontrado.',
  inviteAccepted: 'Este convite já foi aceito. Para bloquear o acesso, revogue o usuário.',
  inviteRevoked: 'Este convite foi revogado. Envie um novo convite.',
  userNotFound: 'Usuário não encontrado.',
  selfRevoke: 'Você não pode revogar o seu próprio acesso.',
  adminRevoke: 'Não é possível revogar o acesso de outro administrador.',
  banFailed: 'O acesso foi marcado como revogado, mas o bloqueio de login falhou. Tente novamente.',
  unbanFailed: 'Não foi possível restaurar o acesso. Tente novamente.',
  internal: 'Erro interno. Tente novamente.',
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const truncate = (s) => String(s ?? '').slice(0, 500);

function isAlreadyRegistered(error) {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  return error.code === 'email_exists' || /already (been )?registered|already exists|email_exists/i.test(text);
}

export function createHandler({ createUserClient, adminClient, siteUrl, allowedOrigins = [] }) {
  const corsHeaders = (request) => {
    const origin = request.headers.get('Origin');
    const h = {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (origin && allowedOrigins.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
    return h;
  };

  const respond = (request, status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    });
  const ok = (request, data = null) => respond(request, 200, { ok: true, data });

  async function sendInvite(invite) {
    const { error } = await adminClient.auth.admin.inviteUserByEmail(invite.email, { redirectTo: siteUrl });
    if (error) {
      await adminClient.from('platform_invites').update({ last_error: truncate(error.message) }).eq('id', invite.id);
      if (isAlreadyRegistered(error)) throw new HttpError(409, 'user_exists', MSG.userExists);
      throw new HttpError(502, 'send_failed', MSG.sendFailed);
    }
    const now = new Date();
    const { data, error: upErr } = await adminClient
      .from('platform_invites')
      .update({
        sent_count: (invite.sent_count ?? 0) + 1,
        last_sent_at: now.toISOString(),
        last_error: null,
        expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
      })
      .eq('id', invite.id)
      .select()
      .single();
    if (upErr) throw new HttpError(500, 'internal', MSG.internal);
    return data;
  }

  // Lista via cliente do chamador (admin): a RPC exige JWT de admin.
  async function listUsers(userClient) {
    const { data, error } = await userClient.rpc('admin_list_users');
    if (error) throw new HttpError(500, 'internal', MSG.internal);
    return data ?? [];
  }

  async function actInvite({ email, note }, { callerId, userClient }) {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
      throw new HttpError(400, 'invalid_email', MSG.badEmail);
    }
    if (note != null && (typeof note !== 'string' || note.length > 500)) {
      throw new HttpError(400, 'invalid_note', MSG.badNote);
    }

    // Conta existente: com login já feito -> 409; nunca entrou -> tenta reenviar.
    const users = await listUsers(userClient);
    const existing = users.find((u) => (u.email ?? '').toLowerCase() === normalized);
    if (existing && (existing.last_sign_in_at || existing.status === 'revoked')) {
      throw new HttpError(409, 'user_exists', MSG.userExists);
    }

    const { data: pending, error: selErr } = await adminClient
      .from('platform_invites')
      .select('*')
      .eq('email', normalized)
      .eq('status', 'pending')
      .maybeSingle();
    if (selErr) throw new HttpError(500, 'internal', MSG.internal);

    let invite = pending;
    let created = false;
    if (!invite) {
      const { data, error } = await adminClient
        .from('platform_invites')
        .insert({ email: normalized, note: note ?? '', invited_by: callerId })
        .select()
        .single();
      if (error || !data) throw new HttpError(500, 'internal', MSG.internal);
      invite = data;
      created = true;
    } else if (typeof note === 'string' && note && note !== invite.note) {
      await adminClient.from('platform_invites').update({ note }).eq('id', invite.id);
    }

    try {
      return await sendInvite(invite);
    } catch (e) {
      // Convite recém-criado para e-mail que já tem conta: não deixar pendente órfão.
      if (created && e instanceof HttpError && e.code === 'user_exists') {
        await adminClient.from('platform_invites').delete().eq('id', invite.id);
      }
      throw e;
    }
  }

  async function loadInvite(inviteId) {
    if (typeof inviteId !== 'string' || !UUID_RE.test(inviteId)) throw new HttpError(400, 'invalid_id', MSG.badId);
    const { data, error } = await adminClient.from('platform_invites').select('*').eq('id', inviteId).maybeSingle();
    if (error) throw new HttpError(500, 'internal', MSG.internal);
    if (!data) throw new HttpError(404, 'invite_not_found', MSG.inviteNotFound);
    return data;
  }

  async function actResend({ inviteId }) {
    const invite = await loadInvite(inviteId);
    if (invite.status === 'accepted') throw new HttpError(409, 'invite_accepted', MSG.inviteAccepted);
    if (invite.status === 'revoked') throw new HttpError(409, 'invite_revoked', MSG.inviteRevoked);
    return sendInvite(invite);
  }

  async function banAndRevoke(userId, callerId) {
    const now = new Date().toISOString();
    const { error } = await adminClient
      .from('user_access')
      .upsert({ user_id: userId, status: 'revoked', revoked_at: now, revoked_by: callerId, updated_at: now }, { onConflict: 'user_id' });
    if (error) throw new HttpError(500, 'internal', MSG.internal);
    const { error: banErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
    if (banErr) throw new HttpError(502, 'ban_failed', MSG.banFailed);
  }

  async function actRevokeInvite({ inviteId }, { callerId }) {
    const invite = await loadInvite(inviteId);
    if (invite.status === 'revoked') return invite;
    if (invite.status === 'accepted') throw new HttpError(409, 'invite_accepted', MSG.inviteAccepted);

    // Convite pendente já vinculado a uma conta que nunca entrou: bloquear também a conta.
    if (invite.accepted_user_id) {
      const { data } = await adminClient.auth.admin.getUserById(invite.accepted_user_id);
      if (data?.user?.last_sign_in_at) throw new HttpError(409, 'invite_accepted', MSG.inviteAccepted);
      await banAndRevoke(invite.accepted_user_id, callerId);
    }
    const { data, error } = await adminClient
      .from('platform_invites')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', invite.id)
      .select()
      .single();
    if (error) throw new HttpError(500, 'internal', MSG.internal);
    return data;
  }

  async function actRevokeUser({ userId }, { callerId, userClient }) {
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) throw new HttpError(400, 'invalid_id', MSG.badId);
    if (userId === callerId) throw new HttpError(400, 'cannot_revoke_self', MSG.selfRevoke);
    const target = (await listUsers(userClient)).find((u) => u.user_id === userId);
    if (!target) throw new HttpError(404, 'user_not_found', MSG.userNotFound);
    if (target.is_admin) throw new HttpError(400, 'cannot_revoke_admin', MSG.adminRevoke);
    await banAndRevoke(userId, callerId);
    return { userId, status: 'revoked' };
  }

  async function actRestoreUser({ userId }, { userClient }) {
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) throw new HttpError(400, 'invalid_id', MSG.badId);
    const target = (await listUsers(userClient)).find((u) => u.user_id === userId);
    if (!target) throw new HttpError(404, 'user_not_found', MSG.userNotFound);
    // Desbanir primeiro: se falhar, o usuário continua revogado (lado seguro).
    const { error: banErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (banErr) throw new HttpError(502, 'unban_failed', MSG.unbanFailed);
    const now = new Date().toISOString();
    const { error } = await adminClient
      .from('user_access')
      .upsert({ user_id: userId, status: 'active', revoked_at: null, revoked_by: null, updated_at: now }, { onConflict: 'user_id' });
    if (error) throw new HttpError(500, 'internal', MSG.internal);
    return { userId, status: 'active' };
  }

  return async function handle(request) {
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', MSG.method);

      const auth = request.headers.get('Authorization') ?? '';
      const match = /^Bearer\s+(\S+)$/i.exec(auth);
      if (!match) throw new HttpError(401, 'unauthorized', MSG.unauthorized);
      const jwt = match[1];

      const userClient = createUserClient(jwt);
      const { data: who, error: whoErr } = await userClient.auth.getUser(jwt);
      const callerId = who?.user?.id;
      if (whoErr || !callerId) throw new HttpError(401, 'unauthorized', MSG.unauthorized);

      const { data: isAdmin, error: adminErr } = await userClient.rpc('am_i_platform_admin');
      if (adminErr || isAdmin !== true) throw new HttpError(403, 'forbidden', MSG.forbidden);

      let body;
      try {
        body = await request.json();
      } catch {
        throw new HttpError(400, 'bad_request', MSG.badJson);
      }
      if (!body || typeof body !== 'object') throw new HttpError(400, 'bad_request', MSG.badJson);

      const ctx = { callerId, userClient };
      let data;
      switch (body.action) {
        case 'invite': data = await actInvite(body, ctx); break;
        case 'resend': data = await actResend(body); break;
        case 'revoke_invite': data = await actRevokeInvite(body, ctx); break;
        case 'revoke_user': data = await actRevokeUser(body, ctx); break;
        case 'restore_user': data = await actRestoreUser(body, ctx); break;
        default: throw new HttpError(400, 'unknown_action', MSG.badAction);
      }
      return ok(request, data);
    } catch (e) {
      if (e instanceof HttpError) {
        return respond(request, e.status, { ok: false, error: { code: e.code, message: e.message } });
      }
      return respond(request, 500, { ok: false, error: { code: 'internal', message: MSG.internal } });
    }
  };
}
