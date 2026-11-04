import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  bootstrapWorkspace,
  cleanupTestUsers,
  createAnomaly,
  createProject,
  createTask,
  createTestUser,
} from './helpers.js';

const TABLES = ['projects', 'tasks', 'anomalies'];

describe('isolamento entre tenants', () => {
  let A;
  let B;
  let ids;
  let admin;

  beforeAll(async () => {
    admin = adminClient();
    A = await createTestUser('a');
    B = await createTestUser('b');
    const wsA = await bootstrapWorkspace(A);
    await bootstrapWorkspace(B);
    const project = await createProject(A, wsA.id);
    const task = await createTask(A, project);
    const anomaly = await createAnomaly(A, project);
    ids = { workspace: wsA.id, projects: project.id, tasks: task.id, anomalies: anomaly.id, project };
  });

  afterAll(cleanupTestUsers);

  it('A lê os próprios dados (controle positivo)', async () => {
    for (const t of TABLES) {
      const { data, error } = await A.client.from(t).select('id').eq('id', ids[t]);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
  });

  it('B não lê projetos, tarefas nem anomalias de A', async () => {
    for (const t of TABLES) {
      const { data, error } = await B.client.from(t).select('*').eq('id', ids[t]);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('B não altera nem apaga dados de A', async () => {
    for (const t of TABLES) {
      const col = t === 'anomalies' ? 'title' : 'name';
      const upd = await B.client.from(t).update({ [col]: 'x' }).eq('id', ids[t]).select();
      expect(upd.error).toBeNull();
      expect(upd.data).toEqual([]);
      const del = await B.client.from(t).delete().eq('id', ids[t]).select();
      expect(del.error).toBeNull();
      expect(del.data).toEqual([]);
      const { data } = await admin.from(t).select('*').eq('id', ids[t]).single();
      expect(data).toBeTruthy();
      expect(data[col]).not.toBe('x');
    }
  });

  it('B não insere tarefa no projeto de A', async () => {
    const { error } = await B.client
      .from('tasks')
      .insert({ workspace_id: ids.workspace, project_id: ids.projects, name: 'invasora' });
    expect(error?.code).toBe('42501');
  });

  it('anon não lê nada', async () => {
    const { count, error: adminErr } = await admin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('id', ids.projects);
    expect(adminErr).toBeNull();
    expect(count).toBeGreaterThanOrEqual(1);
    const { data, error } = await anonClient().from('projects').select('*').eq('id', ids.projects);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
