import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
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

  it('bloqueia o 11º projeto no plano free', async () => {
    // P já existe; cria mais 9 para chegar a 10.
    for (let i = 0; i < 9; i += 1) await createProject(A, ws.id, { name: `P${i}` });
    const { error } = await A.client
      .from('projects')
      .insert({ workspace_id: ws.id, name: 'Décimo primeiro' });
    expect(error?.message).toContain('plan_limit_projects');
  });

  it('com 10 projetos, salvar um projeto existente continua funcionando', async () => {
    const row = projectToRow({ id: P.id, name: 'Renomeado', createdAt: P.created_at }, ws.id);
    const { data, error } = await A.client.from('projects').upsert(row).select('*').single();
    expect(error).toBeNull();
    expect(data.name).toBe('Renomeado');
  });
});
