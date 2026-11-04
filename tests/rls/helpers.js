import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Rls!${RUN_ID}-Aa1`;

/** Only users/workspaces created by this process; never cleaned by pattern. */
const created = { users: [], workspaces: [] };

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

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`);
  return data;
}

export async function createTestUser(label) {
  const url = guardedEnv();
  const admin = adminClient();
  const email = `rls-${label}-${RUN_ID}@projeta.test`;
  const res = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = must(res, 'createUser').user.id;
  created.users.push(id);

  const client = createClient(url, process.env.RLS_SUPABASE_ANON_KEY, opts);
  must(await client.auth.signInWithPassword({ email, password: PASSWORD }), 'signIn');
  return { id, email, client };
}

export async function bootstrapWorkspace(user) {
  // INSERT ... RETURNING fails the SELECT policy (the owner membership is added by an
  // AFTER INSERT trigger, invisible to the same statement), so insert with a client-side
  // id and read the row back afterwards. Task 2 replaces this with the RPC.
  const id = randomUUID();
  must(
    await user.client.from('workspaces').insert({ id, name: `RLS ${RUN_ID}`, owner_id: user.id }),
    'bootstrapWorkspace',
  );
  const row = must(await user.client.from('workspaces').select('*').eq('id', id).single(), 'readWorkspace');
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
  if (created.users.length === 0) return;
  const admin = adminClient();
  for (const id of created.users) {
    // Workspaces owned by this run's users (owner_id is on delete restrict).
    const { error: wsErr } = await admin.from('workspaces').delete().eq('owner_id', id);
    if (wsErr) console.error('cleanup workspaces failed:', wsErr.message);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('cleanup deleteUser failed:', error.message);
  }
  created.users.length = 0;
  created.workspaces.length = 0;
}
