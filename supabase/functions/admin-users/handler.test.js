import { describe, it, expect, beforeEach } from 'vitest';
import { createHandler } from './handler.js';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const OTHER_ADMIN = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-000000000003';
const NEVER = '00000000-0000-4000-8000-000000000004';
const SITE = 'https://projeta.example.com';

// Tabela falsa encadeável: suporta select/insert/update/upsert/delete + eq/maybeSingle/single.
function fakeDb(tables) {
  const calls = [];
  const from = (name) => {
    const rows = tables[name];
    let op = 'select', payload, filters = [], opts;
    const run = () => {
      const match = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      calls.push({ table: name, op, payload, filters });
      if (op === 'insert') {
        const row = { id: `00000000-0000-4000-8000-${String(rows.length + 100).padStart(12, '0')}`, sent_count: 0, status: 'pending', note: '', accepted_user_id: null, ...payload };
        rows.push(row);
        return { data: [row], error: null };
      }
      if (op === 'update') { match.forEach((r) => Object.assign(r, payload)); return { data: match, error: null }; }
      if (op === 'upsert') {
        const k = opts.onConflict; const ex = rows.find((r) => r[k] === payload[k]);
        if (ex) Object.assign(ex, payload); else rows.push({ ...payload });
        return { data: [payload], error: null };
      }
      if (op === 'delete') { const keep = rows.filter((r) => !match.includes(r)); rows.splice(0, rows.length, ...keep); return { data: null, error: null }; }
      return { data: match, error: null };
    };
    const b = {
      select: () => { return b; },
      insert: (p) => { op = 'insert'; payload = p; return b; },
      update: (p) => { op = 'update'; payload = p; return b; },
      upsert: (p, o) => { op = 'upsert'; payload = p; opts = o; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (k, v) => { filters.push([k, v]); return b; },
      maybeSingle: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { from, calls };
}

function setup({ caller = ADMIN, isAdmin = true, inviteError = null, users, tables = {}, getUserResult } = {}) {
  const t = { platform_invites: [], user_access: [], ...tables };
  const db = fakeDb(t);
  const invites = [];
  const bans = [];
  const userList = users ?? [
    { user_id: ADMIN, email: 'admin@x.com', is_admin: true, status: 'active', last_sign_in_at: 'x' },
    { user_id: OTHER_ADMIN, email: 'admin2@x.com', is_admin: true, status: 'active', last_sign_in_at: 'x' },
    { user_id: USER, email: 'ana@x.com', is_admin: false, status: 'active', last_sign_in_at: 'x' },
    { user_id: NEVER, email: 'nunca@x.com', is_admin: false, status: 'active', last_sign_in_at: null },
  ];
  const adminClient = {
    from: db.from,
    auth: {
      admin: {
        inviteUserByEmail: async (email, o) => { invites.push({ email, o }); return { data: {}, error: inviteError }; },
        updateUserById: async (id, attrs) => { bans.push({ id, attrs }); return { data: {}, error: null }; },
        getUserById: async () => getUserResult ?? { data: { user: { last_sign_in_at: null } }, error: null },
      },
    },
  };
  const createUserClient = (jwt) => ({
    auth: { getUser: async () => (jwt === 'bad' ? { data: {}, error: { message: 'x' } } : { data: { user: { id: caller } }, error: null }) },
    rpc: async (fn) => (fn === 'am_i_platform_admin' ? { data: isAdmin, error: null } : { data: userList, error: null }),
  });
  const handler = createHandler({ createUserClient, adminClient, siteUrl: SITE, allowedOrigins: [SITE, 'http://localhost:5174'] });
  const call = (body, { jwt = 'tok', method = 'POST', origin } = {}) =>
    handler(new Request('http://f/admin-users', {
      method,
      headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }));
  return { call, t, invites, bans, handler };
}
const json = (r) => r.json();

describe('admin-users: autenticação e CORS', () => {
  it('sem JWT -> 401', async () => {
    const { call } = setup();
    const r = await call({ action: 'invite' }, { jwt: null });
    expect(r.status).toBe(401);
    expect((await json(r)).error.code).toBe('unauthorized');
  });
  it('JWT inválido -> 401', async () => {
    const { call } = setup();
    expect((await call({ action: 'invite' }, { jwt: 'bad' })).status).toBe(401);
  });
  it('não-admin -> 403', async () => {
    const { call, invites } = setup({ isAdmin: false });
    const r = await call({ action: 'invite', email: 'a@b.com' });
    expect(r.status).toBe(403);
    expect(invites).toHaveLength(0);
  });
  it('OPTIONS devolve CORS para origem permitida', async () => {
    const { call } = setup();
    const r = await call(null, { method: 'OPTIONS', jwt: null, origin: 'http://localhost:5174' });
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5174');
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
  });
  it('origem não permitida não recebe Allow-Origin', async () => {
    const { call } = setup();
    const r = await call(null, { method: 'OPTIONS', jwt: null, origin: 'https://evil.com' });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('respostas JSON também levam CORS', async () => {
    const { call } = setup();
    const r = await call({ action: 'nope' }, { origin: SITE });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(r.status).toBe(400);
  });
  it('GET -> 405', async () => {
    const { call } = setup();
    expect((await call(null, { method: 'GET' })).status).toBe(405);
  });
});

describe('admin-users: invite', () => {
  it('normaliza e-mail, cria convite, envia e conta envio', async () => {
    const { call, t, invites } = setup();
    const r = await call({ action: 'invite', email: '  Novo@Exemplo.COM ', note: 'amigo' });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.ok).toBe(true);
    expect(invites).toEqual([{ email: 'novo@exemplo.com', o: { redirectTo: SITE } }]);
    expect(t.platform_invites).toHaveLength(1);
    const inv = t.platform_invites[0];
    expect(inv).toMatchObject({ email: 'novo@exemplo.com', note: 'amigo', invited_by: ADMIN, sent_count: 1, last_error: null });
    expect(inv.last_sent_at).toBeTruthy();
    expect(new Date(inv.expires_at).getTime()).toBeGreaterThan(Date.now() + 13 * 86400e3);
  });
  it('e-mail inválido -> 400 em português', async () => {
    const { call, invites } = setup();
    const r = await call({ action: 'invite', email: 'sem-arroba' });
    expect(r.status).toBe(400);
    expect((await json(r)).error.message).toMatch(/e-mail/);
    expect(invites).toHaveLength(0);
  });
  it('observação longa -> 400', async () => {
    const { call } = setup();
    expect((await call({ action: 'invite', email: 'a@b.com', note: 'x'.repeat(501) })).status).toBe(400);
  });
  it('reaproveita convite pendente e soma envios', async () => {
    const { call, t } = setup();
    await call({ action: 'invite', email: 'a@b.com' });
    await call({ action: 'invite', email: 'A@B.com' });
    expect(t.platform_invites).toHaveLength(1);
    expect(t.platform_invites[0].sent_count).toBe(2);
  });
  it('falha de envio grava last_error e responde 502 sem vazar erro do provedor', async () => {
    const { call, t } = setup({ inviteError: { message: 'SMTP secret smtp.host:587 refused' } });
    const r = await call({ action: 'invite', email: 'a@b.com' });
    expect(r.status).toBe(502);
    const text = JSON.stringify(await json(r));
    expect(text).not.toContain('SMTP');
    expect(t.platform_invites[0].last_error).toContain('SMTP');
    expect(t.platform_invites[0].sent_count).toBe(0);
  });
  it('usuário ativo que já entrou -> 409 user_exists sem enviar', async () => {
    const { call, invites, t } = setup();
    const r = await call({ action: 'invite', email: 'ana@x.com' });
    expect(r.status).toBe(409);
    const e = (await json(r)).error;
    expect(e.code).toBe('user_exists');
    expect(e.message).toBe('Este e-mail já tem uma conta. Use "Restaurar" se o acesso foi revogado.');
    expect(invites).toHaveLength(0);
    expect(t.platform_invites).toHaveLength(0);
  });
  it('usuário revogado -> 409 user_exists', async () => {
    const users = [{ user_id: USER, email: 'ana@x.com', is_admin: false, status: 'revoked', last_sign_in_at: null }];
    const { call } = setup({ users });
    expect((await call({ action: 'invite', email: 'ana@x.com' })).status).toBe(409);
  });
  it('conta que nunca entrou: reenvia o convite', async () => {
    const { call, invites } = setup();
    const r = await call({ action: 'invite', email: 'nunca@x.com' });
    expect(r.status).toBe(200);
    expect(invites).toHaveLength(1);
  });
  it('provedor responde "já registrado" -> 409 user_exists e não deixa convite órfão', async () => {
    const { call, t } = setup({ inviteError: { status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' } });
    const r = await call({ action: 'invite', email: 'nunca@x.com' });
    expect(r.status).toBe(409);
    expect((await json(r)).error.code).toBe('user_exists');
    expect(t.platform_invites).toHaveLength(0);
  });
});

describe('admin-users: resend e revoke_invite', () => {
  const INV = '11111111-1111-4111-8111-111111111111';
  const row = (o) => ({ id: INV, email: 'a@b.com', status: 'pending', sent_count: 1, note: '', accepted_user_id: null, expires_at: '2020-01-01T00:00:00Z', ...o });

  it('resend renova validade e conta envio', async () => {
    const { call, t, invites } = setup({ tables: { platform_invites: [row()] } });
    const r = await call({ action: 'resend', inviteId: INV });
    expect(r.status).toBe(200);
    expect(t.platform_invites[0].sent_count).toBe(2);
    expect(new Date(t.platform_invites[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(invites).toHaveLength(1);
  });
  it('resend de convite aceito -> 409 sem enviar', async () => {
    const { call, invites } = setup({ tables: { platform_invites: [row({ status: 'accepted' })] } });
    const r = await call({ action: 'resend', inviteId: INV });
    expect(r.status).toBe(409);
    expect((await json(r)).error.code).toBe('invite_accepted');
    expect(invites).toHaveLength(0);
  });
  it('resend inexistente -> 404; id inválido -> 400', async () => {
    const { call } = setup();
    expect((await call({ action: 'resend', inviteId: INV })).status).toBe(404);
    expect((await call({ action: 'resend', inviteId: 'x' })).status).toBe(400);
  });
  it('revoke_invite marca revogado', async () => {
    const { call, t, bans } = setup({ tables: { platform_invites: [row()] } });
    expect((await call({ action: 'revoke_invite', inviteId: INV })).status).toBe(200);
    expect(t.platform_invites[0].status).toBe('revoked');
    expect(t.platform_invites[0].revoked_at).toBeTruthy();
    expect(bans).toHaveLength(0);
  });
  it('revoke_invite com conta vinculada que nunca entrou também bane a conta', async () => {
    const { call, t, bans } = setup({ tables: { platform_invites: [row({ accepted_user_id: NEVER })] } });
    expect((await call({ action: 'revoke_invite', inviteId: INV })).status).toBe(200);
    expect(bans).toEqual([{ id: NEVER, attrs: { ban_duration: '876000h' } }]);
    expect(t.user_access[0]).toMatchObject({ user_id: NEVER, status: 'revoked' });
  });
  it('revoke_invite de convite aceito -> 409', async () => {
    const { call } = setup({ tables: { platform_invites: [row({ status: 'accepted' })] } });
    expect((await call({ action: 'revoke_invite', inviteId: INV })).status).toBe(409);
  });
});

describe('admin-users: revoke_user / restore_user', () => {
  it('não revoga a si mesmo (400)', async () => {
    const { call, bans } = setup();
    const r = await call({ action: 'revoke_user', userId: ADMIN });
    expect(r.status).toBe(400);
    expect((await json(r)).error.code).toBe('cannot_revoke_self');
    expect(bans).toHaveLength(0);
  });
  it('não revoga outro admin (400)', async () => {
    const { call, bans } = setup();
    const r = await call({ action: 'revoke_user', userId: OTHER_ADMIN });
    expect(r.status).toBe(400);
    expect((await json(r)).error.code).toBe('cannot_revoke_admin');
    expect(bans).toHaveLength(0);
  });
  it('revoga usuário: user_access revoked + ban', async () => {
    const { call, t, bans } = setup();
    const r = await call({ action: 'revoke_user', userId: USER });
    expect(r.status).toBe(200);
    expect(t.user_access[0]).toMatchObject({ user_id: USER, status: 'revoked', revoked_by: ADMIN });
    expect(t.user_access[0].revoked_at).toBeTruthy();
    expect(bans).toEqual([{ id: USER, attrs: { ban_duration: '876000h' } }]);
  });
  it('usuário desconhecido -> 404', async () => {
    const { call } = setup();
    expect((await call({ action: 'revoke_user', userId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
  });
  it('restaura: active + ban_duration none', async () => {
    const { call, t, bans } = setup({ tables: { user_access: [{ user_id: USER, status: 'revoked', revoked_at: 'x', revoked_by: ADMIN }] } });
    expect((await call({ action: 'restore_user', userId: USER })).status).toBe(200);
    expect(t.user_access[0]).toMatchObject({ status: 'active', revoked_at: null, revoked_by: null });
    expect(bans).toEqual([{ id: USER, attrs: { ban_duration: 'none' } }]);
  });
});
