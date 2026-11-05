import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  bootstrapWorkspace,
  cleanupTestUsers,
  createAnomaly,
  createProject,
  createTask,
  createTestUser,
} from './helpers.js';
import { projectToRow } from '../../src/utils/supabaseRepository.js';

describe('restrições de dados e limites de plano', () => {
  let A;
  let ws;
  let P;
  let T;
  let N;

  beforeAll(async () => {
    A = await createTestUser('cons-a');
    ws = await bootstrapWorkspace(A);
    P = await createProject(A, ws.id);
    N = await createAnomaly(A, P);
    T = await createTask(A, P);
  });

  afterAll(cleanupTestUsers);

  it('rejeita status de projeto desconhecido', async () => {
    const { error } = await A.client
      .from('projects')
      .insert({ workspace_id: ws.id, name: 'X', status: 'Qualquer' });
    expect(error?.code).toBe('23514');
    const upd = await A.client.from('projects').update({ status: 'Qualquer' }).eq('id', P.id);
    expect(upd.error?.code).toBe('23514');
  });

  it('rejeita severidade e status de anomalia desconhecidos', async () => {
    const sev = await A.client.from('anomalies').update({ severity: 'extrema' }).eq('id', N.id);
    expect(sev.error?.code).toBe('23514');
    const st = await A.client.from('anomalies').update({ status: 'Qualquer' }).eq('id', N.id);
    expect(st.error?.code).toBe('23514');
  });

  it('rejeita nome de tarefa acima de 500 caracteres', async () => {
    const { error } = await A.client.from('tasks').update({ name: 'a'.repeat(501) }).eq('id', T.id);
    expect(error?.code).toBe('23514');
  });

  it('rejeita fotos acima de 3 MB', async () => {
    const photos = ['data:image/jpeg;base64,' + 'A'.repeat(3_100_000)];
    const { error } = await A.client.from('anomalies').update({ photos }).eq('id', N.id);
    expect(error?.code).toBe('23514');
  });

  async function userWithNineProjects(label) {
    const U = await createTestUser(label);
    const w = await bootstrapWorkspace(U);
    for (let i = 0; i < 9; i += 1) await createProject(U, w.id, { name: `P${i}` });
    return { U, w };
  }

  it('bloqueia o 11º projeto no plano free', async () => {
    const { U, w } = await userWithNineProjects('cons-limit');
    await createProject(U, w.id, { name: 'Décimo' });
    const { error } = await U.client
      .from('projects')
      .insert({ workspace_id: w.id, name: 'Décimo primeiro' });
    expect(error?.code).toBe('P0001');
    expect(error?.message).toContain('plan_limit_projects');
  });

  it('com 10 projetos, salvar um projeto existente continua funcionando', async () => {
    const { U, w } = await userWithNineProjects('cons-upsert');
    const last = await createProject(U, w.id, { name: 'Décimo' });
    const row = projectToRow({ id: last.id, name: 'Renomeado', createdAt: last.created_at }, w.id);
    const { data, error } = await U.client.from('projects').upsert(row).select('*').single();
    expect(error).toBeNull();
    expect(data.name).toBe('Renomeado');
  });

  it('inserts concorrentes não ultrapassam o limite do plano', async () => {
    const { U, w } = await userWithNineProjects('cons-race');
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        U.client.from('projects').insert({ workspace_id: w.id, name: `Corrida ${n}` }),
      ),
    );
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(2);
    for (const r of failed) expect(r.error.message).toContain('plan_limit_projects');
    const { count } = await adminClient()
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', w.id);
    expect(count).toBe(10);
  });
});
