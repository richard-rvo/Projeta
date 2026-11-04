import { randomUUID } from 'node:crypto';
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
import {
  anomalyFromRow,
  anomalyToRow,
  projectFromRow,
  projectToRow,
  taskFromRow,
  taskToRow,
} from '../../src/utils/supabaseRepository.js';

// JPEG 1x1 em data URL: o mesmo formato que compressImage() grava em photos.
const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

describe('papel por projeto (project_members)', () => {
  let admin;
  let A; // dono de P e Q
  let B; // viewer em P
  let C; // editor em P
  let D; // sem vínculo
  let E; // membro do workspace de A, sem papel em projeto algum
  let wsA;
  let P;
  let Q;
  let taskP;
  let taskQ;
  let anomalyP;

  beforeAll(async () => {
    admin = adminClient();
    A = await createTestUser('pr-a');
    B = await createTestUser('pr-b');
    C = await createTestUser('pr-c');
    D = await createTestUser('pr-d');
    E = await createTestUser('pr-e');
    wsA = await bootstrapWorkspace(A);
    await bootstrapWorkspace(D);

    P = await createProject(A, wsA.id, { name: 'Projeto P' });
    Q = await createProject(A, wsA.id, { name: 'Projeto Q' });
    taskP = await createTask(A, P, { name: 'Tarefa P' });
    taskQ = await createTask(A, Q, { name: 'Tarefa Q' });
    anomalyP = await createAnomaly(A, P, { title: 'Anomalia P' });

    const { error } = await admin.from('project_members').insert([
      { project_id: P.id, user_id: B.id, role: 'viewer' },
      { project_id: P.id, user_id: C.id, role: 'editor' },
    ]);
    if (error) throw new Error(`seed project_members: ${error.code ?? ''} ${error.message}`);

    // E entra no workspace de A, mas NÃO recebe linha em project_members.
    const ws = await admin.from('workspace_members').insert({ workspace_id: wsA.id, user_id: E.id, role: 'member' });
    if (ws.error) throw new Error(`seed workspace_members: ${ws.error.code ?? ''} ${ws.error.message}`);
  });

  afterAll(cleanupTestUsers);

  it('dono cria projeto e lê de volta na mesma requisição', async () => {
    const { data, error } = await A.client
      .from('projects')
      .upsert({ id: randomUUID(), workspace_id: wsA.id, name: 'Projeto upsert' })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.owner_id).toBe(A.id);

    // O trigger after insert registrou o dono em project_members.
    const member = await admin
      .from('project_members')
      .select('role')
      .eq('project_id', data.id)
      .eq('user_id', A.id)
      .single();
    expect(member.error).toBeNull();
    expect(member.data.role).toBe('owner');
  });

  it('viewer lê tarefas mas não escreve', async () => {
    const read = await B.client.from('tasks').select('id').eq('project_id', P.id);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);

    const upd = await B.client.from('tasks').update({ name: 'pelo viewer' }).eq('id', taskP.id).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);

    const ins = await B.client
      .from('tasks')
      .insert({ workspace_id: P.workspace_id, project_id: P.id, name: 'do viewer' });
    expect(ins.error?.code).toBe('42501');

    const { data } = await admin.from('tasks').select('name').eq('id', taskP.id).single();
    expect(data.name).toBe('Tarefa P');
  });

  it('editor escreve tarefas mas não apaga o projeto', async () => {
    const upd = await C.client.from('tasks').update({ name: 'pelo editor' }).eq('id', taskP.id).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
    expect(upd.data[0].name).toBe('pelo editor');

    // C enxerga o projeto: o [] do delete vem da policy de delete, não da leitura.
    const sees = await C.client.from('projects').select('id').eq('id', P.id);
    expect(sees.error).toBeNull();
    expect(sees.data).toHaveLength(1);

    const del = await C.client.from('projects').delete().eq('id', P.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);

    const still = await admin.from('projects').select('id').eq('id', P.id);
    expect(still.error).toBeNull();
    expect(still.data).toHaveLength(1);
  });

  it('sem vínculo não vê nada', async () => {
    const filters = { projects: ['id', P.id], tasks: ['project_id', P.id], anomalies: ['project_id', P.id] };
    for (const [table, [col, value]] of Object.entries(filters)) {
      const control = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, value);
      expect(control.error).toBeNull();
      expect(control.count).toBeGreaterThanOrEqual(1);

      const { data, error } = await D.client.from(table).select('*').eq(col, value);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  // S3: ser membro do workspace não dá acesso ao projeto; só o papel em project_members dá.
  // Com as policies antigas (is_workspace_member) E via e gravava tudo de P.
  it('membro do workspace sem papel no projeto não vê nada', async () => {
    // Controle positivo: E é membro de wsA de fato, para o admin e para a própria RLS.
    const membership = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', wsA.id)
      .eq('user_id', E.id)
      .single();
    expect(membership.error).toBeNull();
    expect(membership.data.role).toBe('member');
    const seesWorkspace = await E.client.from('workspaces').select('id').eq('id', wsA.id);
    expect(seesWorkspace.error).toBeNull();
    expect(seesWorkspace.data).toHaveLength(1);

    const noRole = await admin.from('project_members').select('user_id').eq('user_id', E.id);
    expect(noRole.error).toBeNull();
    expect(noRole.data).toEqual([]);

    const filters = { projects: ['id', P.id], tasks: ['project_id', P.id], anomalies: ['project_id', P.id] };
    for (const [table, [col, value]] of Object.entries(filters)) {
      const control = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, value);
      expect(control.error).toBeNull();
      expect(control.count).toBeGreaterThanOrEqual(1);

      const { data, error } = await E.client.from(table).select('*').eq(col, value);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    const ins = await E.client
      .from('tasks')
      .insert({ workspace_id: P.workspace_id, project_id: P.id, name: 'do membro sem papel' });
    expect(ins.error?.code).toBe('42501');

    const before = await admin.from('projects').select('name, updated_at').eq('id', P.id).single();
    expect(before.error).toBeNull();
    const upd = await E.client.from('projects').update({ name: 'pelo membro sem papel' }).eq('id', P.id).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);
    const after = await admin.from('projects').select('name, updated_at').eq('id', P.id).single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);
  });

  it('membros veem o próprio vínculo e o dono vê todos', async () => {
    const owner = await A.client.from('project_members').select('user_id, role').eq('project_id', P.id);
    expect(owner.error).toBeNull();
    expect(owner.data.map((m) => `${m.user_id}:${m.role}`).sort()).toEqual(
      [`${A.id}:owner`, `${B.id}:viewer`, `${C.id}:editor`].sort(),
    );

    const viewer = await B.client.from('project_members').select('user_id, role').eq('project_id', P.id);
    expect(viewer.error).toBeNull();
    expect(viewer.data).toEqual([{ user_id: B.id, role: 'viewer' }]);

    const stranger = await D.client.from('project_members').select('user_id').eq('project_id', P.id);
    expect(stranger.error).toBeNull();
    expect(stranger.data).toEqual([]);
  });

  it('ninguém grava project_members pelo cliente', async () => {
    const ins = await A.client.from('project_members').insert({ project_id: P.id, user_id: D.id, role: 'editor' });
    expect(ins.error?.code).toBe('42501');

    const upd = await A.client.from('project_members').update({ role: 'owner' }).eq('project_id', P.id).eq('user_id', B.id);
    expect(upd.error?.code).toBe('42501');

    const del = await A.client.from('project_members').delete().eq('project_id', P.id).eq('user_id', C.id);
    expect(del.error?.code).toBe('42501');

    const { data, error } = await admin.from('project_members').select('user_id, role').eq('project_id', P.id);
    expect(error).toBeNull();
    expect(data.map((m) => `${m.user_id}:${m.role}`).sort()).toEqual(
      [`${A.id}:owner`, `${B.id}:viewer`, `${C.id}:editor`].sort(),
    );
  });

  it('owner_id e project_id são imutáveis', async () => {
    const owner = await A.client.from('projects').update({ owner_id: B.id }).eq('id', P.id);
    expect(owner.error?.code).toBe('42501');
    expect(owner.error?.message).toBe('owner_id não pode ser alterado');

    const move = await A.client.from('tasks').update({ project_id: Q.id }).eq('id', taskP.id);
    expect(move.error?.code).toBe('42501');
    expect(move.error?.message).toBe('project_id não pode ser alterado');

    const project = await admin.from('projects').select('owner_id').eq('id', P.id).single();
    expect(project.data.owner_id).toBe(A.id);
    const task = await admin.from('tasks').select('project_id').eq('id', taskP.id).single();
    expect(task.data.project_id).toBe(P.id);
  });

  it('anomalia não aponta para tarefa de outro projeto', async () => {
    const ins = await A.client
      .from('anomalies')
      .insert({ workspace_id: P.workspace_id, project_id: P.id, task_id: taskQ.id, title: 'cruzada' });
    expect(ins.error?.code).toBe('23503');

    const upd = await A.client.from('anomalies').update({ task_id: taskQ.id }).eq('id', anomalyP.id);
    expect(upd.error?.code).toBe('23503');

    // Controle positivo: a tarefa do mesmo projeto é aceita.
    const ok = await A.client.from('anomalies').update({ task_id: taskP.id }).eq('id', anomalyP.id).select();
    expect(ok.error).toBeNull();
    expect(ok.data[0].task_id).toBe(taskP.id);
  });

  it('apagar tarefa preserva a anomalia', async () => {
    const doomed = await createTask(A, P, { name: 'Tarefa que some' });
    const anomaly = await createAnomaly(A, P, { title: 'Anomalia da tarefa', task_id: doomed.id });
    expect(anomaly.task_id).toBe(doomed.id);

    const del = await A.client.from('tasks').delete().eq('id', doomed.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);

    const { data, error } = await admin.from('anomalies').select('task_id, project_id').eq('id', anomaly.id).single();
    expect(error).toBeNull();
    expect(data.task_id).toBeNull();
    expect(data.project_id).toBe(P.id);
  });

  it('payloads do app fazem ida e volta', async () => {
    // Mesmos mapeadores e mesma chamada de saveProject/saveTask/saveAnomaly.
    const project = {
      name: 'Projeto do app',
      description: 'Parada de manutenção',
      startDate: '2026-11-04',
      endDate: '2026-12-18',
      status: 'Em Andamento',
    };
    const savedProject = await A.client.from('projects').upsert(projectToRow(project, wsA.id)).select('*').single();
    expect(savedProject.error).toBeNull();
    const p = projectFromRow(savedProject.data);
    expect(savedProject.data.owner_id).toBe(A.id);
    expect(p).toMatchObject({
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
    });
    expect(p.calendars.length).toBeGreaterThan(0);
    expect(p.defaultCalendarId).toBe(p.calendars[0].id);

    const task = {
      projectId: p.id,
      name: 'Montar andaime',
      startDate: '2026-11-04T08:00',
      endDate: '2026-11-06T17:00',
      progress: 25,
      scheduleMode: 'auto',
      dependsOn: [],
      indentLevel: 1,
      order: 3,
      resources: ['Equipe A'],
    };
    const savedTask = await A.client.from('tasks').upsert(taskToRow(task, wsA.id)).select('*').single();
    expect(savedTask.error).toBeNull();
    const t = taskFromRow(savedTask.data);
    expect(t).toMatchObject({
      projectId: p.id,
      name: task.name,
      progress: 25,
      scheduleMode: 'auto',
      indentLevel: 1,
      order: 3,
      resources: ['Equipe A'],
    });
    expect(t.startDate.slice(0, 16)).toBe(task.startDate);
    expect(t.endDate.slice(0, 16)).toBe(task.endDate);

    const anomaly = {
      projectId: p.id,
      taskId: t.id,
      title: 'Vazamento na flange',
      description: 'Gotejamento constante',
      status: 'aberta',
      severity: 'alta',
      type: 'Segurança',
      reportedBy: 'Inspetor RLS',
      photos: [PHOTO],
      occurredAt: '2026-11-04T10:30',
    };
    const savedAnomaly = await A.client.from('anomalies').upsert(anomalyToRow(anomaly, wsA.id)).select('*').single();
    expect(savedAnomaly.error).toBeNull();
    const a = anomalyFromRow(savedAnomaly.data);
    expect(a).toMatchObject({
      projectId: p.id,
      taskId: t.id,
      title: anomaly.title,
      description: anomaly.description,
      status: 'aberta',
      severity: 'alta',
      type: 'Segurança',
      reportedBy: 'Inspetor RLS',
      photos: [PHOTO],
    });
    expect(a.occurredAt.slice(0, 16)).toBe(anomaly.occurredAt);

    // Caminho de update do upsert: mesmo id, nome novo.
    const renamed = await A.client
      .from('tasks')
      .upsert(taskToRow({ ...t, name: 'Montar andaime (revisado)' }, wsA.id))
      .select('*')
      .single();
    expect(renamed.error).toBeNull();
    expect(renamed.data.id).toBe(t.id);
    expect(renamed.data.name).toBe('Montar andaime (revisado)');
    expect(renamed.data.created_at).toBe(savedTask.data.created_at);

    const reProject = await A.client
      .from('projects')
      .upsert(projectToRow({ ...p, name: 'Projeto do app (revisado)' }, wsA.id))
      .select('*')
      .single();
    expect(reProject.error).toBeNull();
    expect(reProject.data.id).toBe(p.id);
    expect(reProject.data.name).toBe('Projeto do app (revisado)');
    expect(reProject.data.owner_id).toBe(A.id);

    // Recarregar: o que o app lê depois do refresh.
    const reloaded = await A.client.from('anomalies').select('*').eq('id', a.id).single();
    expect(reloaded.error).toBeNull();
    expect(anomalyFromRow(reloaded.data).photos).toEqual([PHOTO]);
  });
});
