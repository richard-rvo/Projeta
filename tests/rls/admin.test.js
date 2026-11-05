import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  bootstrapWorkspace,
  cleanupTestUsers,
  createAnomaly,
  createInvite,
  createProject,
  createTask,
  createTestUser,
  sql,
  testEmail,
} from './helpers.js';

const OVERVIEW_KEYS = [
  'users_total', 'users_active', 'users_revoked',
  'invites_pending', 'invites_expired', 'invites_accepted', 'invites_revoked', 'acceptance_rate',
  'active_7d', 'active_30d',
  'projects', 'tasks', 'anomalies', 'minutes', 'actions_open',
].sort();

const USER_KEYS = [
  'user_id', 'email', 'display_name', 'status', 'is_admin', 'created_at', 'last_sign_in_at',
  'invited_at', 'projects', 'tasks', 'anomalies', 'minutes', 'last_activity_at', 'photos_bytes',
].sort();

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('plataforma só por convite, acesso revogável e RPCs do admin', () => {
  let admin;
  let ADM; // administrador da plataforma (semeado via SQL)
  let A; // convidado comum, dono de P
  let B; // outro convidado comum
  let wsA;
  let P;
  let T;
  let minuteId;
  const seededAdmins = [];

  async function setAccess(userId, status) {
    const { error } = await admin
      .from('user_access')
      .update({ status, revoked_at: status === 'revoked' ? new Date().toISOString() : null })
      .eq('user_id', userId);
    if (error) throw new Error(`setAccess: ${error.code ?? ''} ${error.message}`);
  }

  beforeAll(async () => {
    admin = adminClient();
    ADM = await createTestUser('adm-admin');
    A = await createTestUser('adm-a');
    B = await createTestUser('adm-b');
    await sql('insert into private.platform_admins (user_id) values ($1) on conflict do nothing', [ADM.id]);
    seededAdmins.push(ADM.id);

    await bootstrapWorkspace(ADM);
    wsA = await bootstrapWorkspace(A);
    await bootstrapWorkspace(B);
    P = await createProject(A, wsA.id, { name: 'Projeto Admin RLS' });
    T = await createTask(A, P);
    await createAnomaly(A, P, { photos: [{ id: 'f1', dataUrl: 'data:image/png;base64,AAAA' }] });
    minuteId = randomUUID();
    const saved = await A.client
      .rpc('save_meeting_minute', {
        p_minute: {
          id: minuteId,
          workspace_id: P.workspace_id,
          project_id: P.id,
          title: 'Ata Admin RLS',
          meeting_at: '2026-11-05T10:00',
          location: '',
          participants: '',
          template: 'blank',
          content: EMPTY_DOC,
          content_text: '',
        },
        p_actions: [{ id: randomUUID(), description: 'Ação RLS', owner_name: '', due_date: null, status: 'aberta', task_id: null }],
      })
      .single();
    if (saved.error) throw new Error(`save_meeting_minute: ${saved.error.code} ${saved.error.message}`);
  });

  afterAll(async () => {
    if (seededAdmins.length > 0) {
      await sql('delete from private.platform_admins where user_id = any($1::uuid[])', [seededAdmins]);
    }
    await cleanupTestUsers();
  });

  // ─── cadastro só por convite ──────────────────────────────────────────────

  describe('cadastro só por convite', () => {
    it('createUser sem convite falha e não cria o usuário', async () => {
      const email = testEmail('adm-sem-convite');
      const res = await admin.auth.admin.createUser({ email, password: `X!${randomUUID()}Aa1`, email_confirm: true });
      if (res.data?.user?.id) await admin.auth.admin.deleteUser(res.data.user.id);
      expect(res.error).not.toBeNull();
      expect(res.data?.user ?? null).toBeNull();
      const { rows } = await sql('select count(*)::int as n from auth.users where email = $1', [email]);
      expect(rows[0].n).toBe(0);
    });

    it('o trigger levanta invite_required (42501) sem convite pendente', async () => {
      const email = testEmail('adm-sql-sem-convite');
      let err;
      try {
        const { rows } = await sql(
          "insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id",
          [email],
        );
        await sql('delete from auth.users where id = $1', [rows[0].id]);
      } catch (e) {
        err = e;
      }
      expect(err?.code).toBe('42501');
      expect(err?.message).toBe('invite_required');
    });

    it('convite expirado ou revogado não libera o cadastro', async () => {
      const expired = testEmail('adm-expirado');
      await createInvite(expired, { expires_at: new Date(Date.now() - 60_000).toISOString() });
      const r1 = await admin.auth.admin.createUser({ email: expired, password: `X!${randomUUID()}Aa1`, email_confirm: true });
      if (r1.data?.user?.id) await admin.auth.admin.deleteUser(r1.data.user.id);
      expect(r1.error).not.toBeNull();

      const revoked = testEmail('adm-revogado');
      await createInvite(revoked, { status: 'revoked', revoked_at: new Date().toISOString() });
      const r2 = await admin.auth.admin.createUser({ email: revoked, password: `X!${randomUUID()}Aa1`, email_confirm: true });
      if (r2.data?.user?.id) await admin.auth.admin.deleteUser(r2.data.user.id);
      expect(r2.error).not.toBeNull();
    });

    it('com convite passa: convite ganha accepted_user_id e user_access nasce ativo', async () => {
      const N = await createTestUser('adm-novo');
      const invite = await admin.from('platform_invites').select('*').eq('email', N.email).single();
      expect(invite.error).toBeNull();
      expect(invite.data.accepted_user_id).toBe(N.id);
      expect(invite.data.status).toBe('pending');

      const access = await admin.from('user_access').select('*').eq('user_id', N.id).single();
      expect(access.error).toBeNull();
      expect(access.data.status).toBe('active');
      expect(access.data.invite_id).toBe(invite.data.id);

      // Primeiro acesso marca o convite como aceito.
      const ws = await N.client.rpc('ensure_personal_workspace').single();
      expect(ws.error).toBeNull();
      const after = await admin.from('platform_invites').select('*').eq('id', invite.data.id).single();
      expect(after.data.status).toBe('accepted');
      expect(after.data.accepted_at).not.toBeNull();

      // Idempotente: o segundo acesso não muda accepted_at.
      await N.client.rpc('ensure_personal_workspace').single();
      const again = await admin.from('platform_invites').select('accepted_at').eq('id', invite.data.id).single();
      expect(again.data.accepted_at).toBe(after.data.accepted_at);
    });

    it('e-mail do convite precisa estar normalizado', async () => {
      const { error } = await admin.from('platform_invites').insert({ email: ' Fulano@Projeta.test ' });
      expect(error?.code).toBe('23514');
    });

    it('só um convite pendente por e-mail', async () => {
      const email = testEmail('adm-duplo');
      await createInvite(email);
      const { error } = await admin.from('platform_invites').insert({ email });
      expect(error?.code).toBe('23505');
    });
  });

  // ─── leitura pelo cliente ─────────────────────────────────────────────────

  describe('convites e user_access pelo cliente', () => {
    it('não-admin não lê convites', async () => {
      const { data, error } = await A.client.from('platform_invites').select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('usuário lê só a própria linha de user_access', async () => {
      const { data, error } = await A.client.from('user_access').select('user_id, status');
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: A.id, status: 'active' }]);
    });

    it('cliente não escreve em convites nem em user_access', async () => {
      const ins = await A.client.from('platform_invites').insert({ email: testEmail('adm-cliente') });
      expect(ins.error?.code).toBe('42501');
      const upd = await A.client.from('user_access').update({ status: 'revoked' }).eq('user_id', B.id);
      expect(upd.error?.code).toBe('42501');
      const self = await A.client.from('user_access').update({ status: 'active' }).eq('user_id', A.id);
      expect(self.error?.code).toBe('42501');
    });

    it('anon não lê convites nem user_access', async () => {
      const anon = anonClient();
      const inv = await anon.from('platform_invites').select('id');
      expect(inv.error?.code).toBe('42501');
      const acc = await anon.from('user_access').select('user_id');
      expect(acc.error?.code).toBe('42501');
    });

    it('admin lê convites e user_access de todos', async () => {
      const inv = await ADM.client.from('platform_invites').select('email').eq('email', A.email);
      expect(inv.error).toBeNull();
      expect(inv.data).toEqual([{ email: A.email }]);
      const acc = await ADM.client.from('user_access').select('user_id').in('user_id', [A.id, B.id]);
      expect(acc.error).toBeNull();
      expect(acc.data).toHaveLength(2);
    });
  });

  // ─── RPCs do admin ────────────────────────────────────────────────────────

  describe('RPCs do admin', () => {
    it('am_i_platform_admin é verdadeiro só para o admin', async () => {
      const adm = await ADM.client.rpc('am_i_platform_admin');
      expect(adm.error).toBeNull();
      expect(adm.data).toBe(true);
      const a = await A.client.rpc('am_i_platform_admin');
      expect(a.error).toBeNull();
      expect(a.data).toBe(false);
      const anon = await anonClient().rpc('am_i_platform_admin');
      expect(anon.error?.code).toBe('42501');
    });

    it('não-admin recebe 42501 em admin_overview e admin_list_users', async () => {
      const o = await A.client.rpc('admin_overview');
      expect(o.error?.code).toBe('42501');
      expect(o.data).toBeNull();
      const l = await A.client.rpc('admin_list_users');
      expect(l.error?.code).toBe('42501');
      expect(l.data).toBeNull();
      const anonO = await anonClient().rpc('admin_overview');
      expect(anonO.error?.code).toBe('42501');
      const anonL = await anonClient().rpc('admin_list_users');
      expect(anonL.error?.code).toBe('42501');
    });

    it('admin_overview devolve as chaves exatas', async () => {
      const { data, error } = await ADM.client.rpc('admin_overview');
      expect(error).toBeNull();
      expect(Object.keys(data).sort()).toEqual(OVERVIEW_KEYS);
      for (const key of OVERVIEW_KEYS) expect(typeof data[key]).toBe('number');
      expect(data.users_total).toBeGreaterThanOrEqual(4);
      expect(data.users_active).toBeGreaterThanOrEqual(3);
      expect(data.acceptance_rate).toBeGreaterThanOrEqual(0);
      expect(data.acceptance_rate).toBeLessThanOrEqual(1);
      expect(data.projects).toBeGreaterThanOrEqual(1);
      expect(data.minutes).toBeGreaterThanOrEqual(1);
      expect(data.actions_open).toBeGreaterThanOrEqual(1);
      expect(data.active_30d).toBeGreaterThanOrEqual(data.active_7d);
    });

    it('admin_list_users devolve as colunas exatas e as contagens do dono', async () => {
      const { data, error } = await ADM.client.rpc('admin_list_users');
      expect(error).toBeNull();
      const rowA = data.find((r) => r.user_id === A.id);
      const rowAdm = data.find((r) => r.user_id === ADM.id);
      expect(Object.keys(rowA).sort()).toEqual(USER_KEYS);
      expect(rowA).toMatchObject({
        email: A.email,
        status: 'active',
        is_admin: false,
        projects: 1,
        tasks: 1,
        anomalies: 1,
        minutes: 1,
      });
      expect(rowA.photos_bytes).toBeGreaterThan(0);
      expect(rowA.last_activity_at).not.toBeNull();
      expect(rowA.invited_at).not.toBeNull();
      expect(rowAdm.is_admin).toBe(true);
      expect(rowAdm.projects).toBe(0);
    });

    it('admin não lê o conteúdo dos projetos alheios', async () => {
      const proj = await ADM.client.from('projects').select('id').eq('id', P.id);
      expect(proj.data).toEqual([]);
      const tasks = await ADM.client.from('tasks').select('id').eq('id', T.id);
      expect(tasks.data).toEqual([]);
    });
  });

  // ─── revogação com efeito imediato ────────────────────────────────────────

  describe('revogação com efeito imediato', () => {
    afterAll(async () => {
      await setAccess(A.id, 'active');
    });

    it('revogado (JWT ainda válido) não lê nem grava nada; restaurado volta a ver', async () => {
      await setAccess(A.id, 'revoked');

      for (const table of ['projects', 'tasks', 'anomalies', 'meeting_minutes', 'meeting_actions', 'workspaces', 'workspace_members', 'project_members']) {
        const { data, error } = await A.client.from(table).select('*');
        expect({ table, error }).toEqual({ table, error: null });
        expect({ table, data }).toEqual({ table, data: [] });
      }

      const rpc = await A.client.rpc('ensure_personal_workspace').single();
      expect(rpc.error?.code).toBe('42501');
      expect(rpc.error?.message).toBe('access_revoked');

      const insProject = await A.client.from('projects').insert({ workspace_id: wsA.id, name: 'Revogado' });
      expect(insProject.error?.code).toBe('42501');
      const insTask = await A.client
        .from('tasks')
        .insert({ workspace_id: wsA.id, project_id: P.id, name: 'Revogado' });
      expect(insTask.error?.code).toBe('42501');
      const insAnomaly = await A.client
        .from('anomalies')
        .insert({ workspace_id: wsA.id, project_id: P.id, title: 'Revogado' });
      expect(insAnomaly.error?.code).toBe('42501');
      const saveMinute = await A.client.rpc('save_meeting_minute', {
        p_minute: { id: randomUUID(), workspace_id: wsA.id, project_id: P.id, title: 'Revogado', content: EMPTY_DOC },
        p_actions: [],
      });
      expect(saveMinute.error?.code).toBe('42501');

      const updProject = await A.client.from('projects').update({ name: 'Revogado' }).eq('id', P.id).select();
      expect(updProject.data ?? []).toEqual([]);
      const updWs = await A.client.from('workspaces').update({ name: 'Revogado' }).eq('id', wsA.id).select();
      expect(updWs.data ?? []).toEqual([]);
      const delTask = await A.client.from('tasks').delete().eq('id', T.id).select();
      expect(delTask.data ?? []).toEqual([]);
      const delProject = await A.client.from('projects').delete().eq('id', P.id).select();
      expect(delProject.data ?? []).toEqual([]);

      const stored = await admin.from('projects').select('name').eq('id', P.id).single();
      expect(stored.data.name).toBe('Projeto Admin RLS');
      const storedTask = await admin.from('tasks').select('id').eq('id', T.id);
      expect(storedTask.data).toHaveLength(1);
      const storedWs = await admin.from('workspaces').select('name').eq('id', wsA.id).single();
      expect(storedWs.data.name).not.toBe('Revogado');

      // O admin vê o status revogado.
      const list = await ADM.client.rpc('admin_list_users');
      expect(list.data.find((r) => r.user_id === A.id).status).toBe('revoked');

      await setAccess(A.id, 'active');

      const back = await A.client.rpc('ensure_personal_workspace').single();
      expect(back.error).toBeNull();
      expect(back.data.id).toBe(wsA.id);
      for (const table of ['projects', 'tasks', 'anomalies', 'meeting_minutes', 'meeting_actions']) {
        const { data, error } = await A.client.from(table).select('id');
        expect({ table, error }).toEqual({ table, error: null });
        expect({ table, n: data.length }).toEqual({ table, n: 1 });
      }
    });

    it('revogar B não afeta A (controle positivo)', async () => {
      await setAccess(B.id, 'revoked');
      try {
        const { data, error } = await A.client.from('projects').select('id').eq('id', P.id);
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
      } finally {
        await setAccess(B.id, 'active');
      }
    });
  });
});
