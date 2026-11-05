import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Rls!${RUN_ID}-Aa1`;

/** Only users/workspaces/invites created by this process; never cleaned by pattern. */
const created = { users: [], workspaces: [], inviteEmails: [] };

export const runId = RUN_ID;

export function assertConfirmedTarget(url, confirmRef) {
  if (typeof confirmRef !== 'string' || confirmRef.length === 0) {
    throw new Error('RLS_CONFIRM_PROJECT_REF is empty: refusing to run against an unconfirmed target.');
  }
  if (typeof url !== 'string' || !url.includes(confirmRef)) {
    throw new Error('RLS_SUPABASE_URL does not match RLS_CONFIRM_PROJECT_REF: refusing to run.');
  }
}

function guardedEnv() {
  const url = process.env.RLS_SUPABASE_URL;
  assertConfirmedTarget(url, process.env.RLS_CONFIRM_PROJECT_REF);
  return url;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient() {
  const url = guardedEnv();
  return createClient(url, process.env.RLS_SUPABASE_SERVICE_ROLE_KEY, opts);
}

export function anonClient() {
  const url = guardedEnv();
  return createClient(url, process.env.RLS_SUPABASE_ANON_KEY, opts);
}

/**
 * Direct SQL as the database owner (RLS_DB_URL). Only for what the REST API
 * cannot reach, e.g. seeding private.platform_admins. One connection per call.
 */
export async function sql(text, params = []) {
  guardedEnv();
  const dbUrl = process.env.RLS_DB_URL;
  if (typeof dbUrl !== 'string' || !dbUrl.includes(process.env.RLS_CONFIRM_PROJECT_REF)) {
    throw new Error('RLS_DB_URL does not match RLS_CONFIRM_PROJECT_REF: refusing to run.');
  }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

export function testEmail(label) {
  return `rls-${label}-${RUN_ID}@projeta.test`.toLowerCase();
}

/** Pending platform invite (service role bypasses RLS); tracked for cleanup. */
export async function createInvite(email, fields = {}) {
  const admin = adminClient();
  created.inviteEmails.push(email);
  return must(
    await admin.from('platform_invites').insert({ email, note: 'rls', ...fields }).select().single(),
    'createInvite',
  );
}

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`);
  return data;
}

/** signupEmail permite cadastrar com outra caixa (o convite é sempre minúsculo). */
export async function createTestUser(label, { signupEmail } = {}) {
  const url = guardedEnv();
  const admin = adminClient();
  const email = testEmail(label);
  // Cadastro só por convite: o trigger em auth.users exige um convite pendente.
  await createInvite(email);
  const res = await admin.auth.admin.createUser({ email: signupEmail ?? email, password: PASSWORD, email_confirm: true });
  const id = must(res, 'createUser').user.id;
  created.users.push(id);

  const client = createClient(url, process.env.RLS_SUPABASE_ANON_KEY, opts);
  must(await client.auth.signInWithPassword({ email, password: PASSWORD }), 'signIn');
  return { id, email, password: PASSWORD, client };
}

export async function bootstrapWorkspace(user) {
  // Same path as the app: the personal workspace comes from the SECURITY DEFINER RPC.
  const row = must(await user.client.rpc('ensure_personal_workspace').single(), 'bootstrapWorkspace');
  created.workspaces.push(row.id);
  return row;
}

export async function createProject(user, workspaceId, fields = {}) {
  return must(
    await user.client
      .from('projects')
      .insert({ workspace_id: workspaceId, name: 'Projeto RLS', ...fields })
      .select()
      .single(),
    'createProject',
  );
}

export async function createTask(user, project, fields = {}) {
  return must(
    await user.client
      .from('tasks')
      .insert({ workspace_id: project.workspace_id, project_id: project.id, name: 'Tarefa RLS', ...fields })
      .select()
      .single(),
    'createTask',
  );
}

export async function createAnomaly(user, project, fields = {}) {
  return must(
    await user.client
      .from('anomalies')
      .insert({ workspace_id: project.workspace_id, project_id: project.id, title: 'Anomalia RLS', ...fields })
      .select()
      .single(),
    'createAnomaly',
  );
}

export async function cleanupTestUsers() {
  if (created.users.length === 0 && created.inviteEmails.length === 0) return;
  const admin = adminClient();
  for (const id of created.users) {
    // Workspaces owned by this run's users (owner_id is on delete restrict).
    const { error: wsErr } = await admin.from('workspaces').delete().eq('owner_id', id);
    if (wsErr) console.error('cleanup workspaces failed:', wsErr.message);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('cleanup deleteUser failed:', error.message);
  }
  if (created.inviteEmails.length > 0) {
    const { error } = await admin.from('platform_invites').delete().in('email', created.inviteEmails);
    if (error) console.error('cleanup invites failed:', error.message);
  }
  created.users.length = 0;
  created.workspaces.length = 0;
  created.inviteEmails.length = 0;
}
