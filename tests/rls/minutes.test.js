import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  bootstrapWorkspace,
  cleanupTestUsers,
  createProject,
  createTask,
  createTestUser,
} from './helpers.js';
import { actionFromRow, minuteFromRow, minuteToRpcArgs } from '../../src/features/minutes/minutesRepository.js';
import { dedupeActionIds } from '../../src/features/minutes/minuteDoc.js';
import { MINUTE_TEMPLATES } from '../../src/features/minutes/templates.js';

const EMPTY = { type: 'doc', content: [{ type: 'paragraph' }] };

// Mesmo formato de p_actions que minuteToRpcArgs produz.
const action = (fields = {}) => ({
  id: randomUUID(),
  description: 'Ação RLS',
  owner_name: '',
  due_date: null,
  status: 'aberta',
  task_id: null,
  ...fields,
});

describe('atas de reunião (meeting_minutes e meeting_actions)', () => {
  let admin;
  let A; // dono de P e Q
  let B; // viewer em P
  let C; // editor em P
  let D; // sem vínculo
  let wsA;
  let P;
  let Q;
  let minuteM; // ata dos três primeiros testes

  // Mesmo formato de p_minute que minuteToRpcArgs produz.
  const rpcArgs = (minute = {}, actions = []) => ({
    p_minute: {
      id: randomUUID(),
      workspace_id: P.workspace_id,
      project_id: P.id,
      title: 'Ata RLS',
      meeting_at: '2026-11-04T10:00',
      location: '',
      participants: '',
      template: 'blank',
      content: EMPTY,
      content_text: '',
      ...minute,
    },
    p_actions: actions,
  });

  const save = (user, args) => user.client.rpc('save_meeting_minute', args).single();

  async function actionsOfProject(projectId) {
    const { data, error } = await admin
      .from('meeting_actions')
      .select('*')
      .eq('project_id', projectId)
      .order('position');
    if (error) throw new Error(`actionsOfProject: ${error.code ?? ''} ${error.message}`);
    return data;
  }

  async function actionsOfMinute(minuteId) {
    const { data, error } = await admin
      .from('meeting_actions')
      .select('*')
      .eq('minute_id', minuteId)
      .order('position');
    if (error) throw new Error(`actionsOfMinute: ${error.code ?? ''} ${error.message}`);
    return data;
  }

  beforeAll(async () => {
    admin = adminClient();
    A = await createTestUser('mm-a');
    B = await createTestUser('mm-b');
    C = await createTestUser('mm-c');
    D = await createTestUser('mm-d');
    wsA = await bootstrapWorkspace(A);
    await bootstrapWorkspace(D);

    P = await createProject(A, wsA.id, { name: 'Projeto P' });
    Q = await createProject(A, wsA.id, { name: 'Projeto Q' });

    const { error } = await admin
      .from('project_members')
      .insert([
        { project_id: P.id, user_id: B.id, role: 'viewer' },
        { project_id: P.id, user_id: C.id, role: 'editor' },
      ]);
    if (error) throw new Error(`seed project_members: ${error.code ?? ''} ${error.message}`);
  });

  afterAll(cleanupTestUsers);

  it('dono salva ata com duas ações pela RPC', async () => {
    const first = action({ description: 'Comprar cimento', owner_name: 'Ana', due_date: '2026-11-10' });
    const second = action({ description: 'Revisar escopo' });
    const args = rpcArgs({ title: 'Ata de status' }, [first, second]);

    const { data, error } = await save(A, args);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: args.p_minute.id,
      workspace_id: wsA.id,
      project_id: P.id,
      title: 'Ata de status',
      created_by: A.id,
    });
    minuteM = data;

    // A lê pela própria RLS (dono >= viewer).
    const rows = await A.client
      .from('meeting_actions')
      .select('id, minute_id, description, owner_name, due_date, position')
      .eq('project_id', P.id)
      .order('position');
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([
      { id: first.id, minute_id: minuteM.id, description: 'Comprar cimento', owner_name: 'Ana', due_date: '2026-11-10', position: 1 },
      { id: second.id, minute_id: minuteM.id, description: 'Revisar escopo', owner_name: '', due_date: null, position: 2 },
    ]);
  });

  it('salvar de novo sem uma ação remove essa ação', async () => {
    const before = await actionsOfProject(P.id);
    expect(before).toHaveLength(2);
    const kept = before[1];

    const { data, error } = await save(
      A,
      rpcArgs({ id: minuteM.id, title: 'Ata de status (revisada)' }, [
        action({ id: kept.id, description: kept.description }),
      ]),
    );
    expect(error).toBeNull();
    expect(data.id).toBe(minuteM.id);
    expect(data.title).toBe('Ata de status (revisada)');
    expect(data.created_at).toBe(minuteM.created_at);
    expect(data.created_by).toBe(A.id);

    const after = await actionsOfProject(P.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(kept.id);
    expect(after[0].position).toBe(1);
  });

  it('salvar com zero ações remove todas', async () => {
    expect(await actionsOfProject(P.id)).toHaveLength(1);

    const { error } = await save(A, rpcArgs({ id: minuteM.id, title: 'Ata de status (revisada)' }, []));
    expect(error).toBeNull();

    expect(await actionsOfProject(P.id)).toEqual([]);
  });

  it('ação com id de outra ata não é sequestrada', async () => {
    const original = action({ description: 'Ação da ata X', owner_name: 'Bruno' });
    const x = await save(A, rpcArgs({ title: 'Ata X' }, [original]));
    expect(x.error).toBeNull();
    expect((await actionsOfMinute(x.data.id)).map((a) => a.id)).toEqual([original.id]);

    // Y reaproveita o id da ação de X (o que um "colar" sem regenerar faria).
    const y = await save(
      A,
      rpcArgs({ title: 'Ata Y' }, [action({ id: original.id, description: 'sequestro', owner_name: 'Intruso' })]),
    );
    expect(y.error).toBeNull();

    const { data, error } = await admin
      .from('meeting_actions')
      .select('minute_id, description, owner_name, position')
      .eq('id', original.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ minute_id: x.data.id, description: 'Ação da ata X', owner_name: 'Bruno', position: 1 });
    expect(await actionsOfMinute(y.data.id)).toEqual([]);
  });

  it('viewer lê mas não salva', async () => {
    const own = await save(A, rpcArgs({ title: 'Ata do dono' }, [action({ description: 'Ação do dono' })]));
    expect(own.error).toBeNull();

    const read = await B.client.from('meeting_minutes').select('id, title').eq('id', own.data.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([{ id: own.data.id, title: 'Ata do dono' }]);

    const readActions = await B.client.from('meeting_actions').select('description').eq('minute_id', own.data.id);
    expect(readActions.error).toBeNull();
    expect(readActions.data).toEqual([{ description: 'Ação do dono' }]);

    // Caminho de update (ata existente) e de insert (ata nova).
    const overwrite = await save(B, rpcArgs({ id: own.data.id, title: 'pelo viewer' }, []));
    expect(overwrite.error?.code).toBe('42501');
    const freshArgs = rpcArgs({ title: 'nova do viewer' }, [action()]);
    const fresh = await save(B, freshArgs);
    expect(fresh.error?.code).toBe('42501');

    const still = await admin.from('meeting_minutes').select('title').eq('id', own.data.id).single();
    expect(still.error).toBeNull();
    expect(still.data.title).toBe('Ata do dono');
    expect(await actionsOfMinute(own.data.id)).toHaveLength(1);
    const ghost = await admin.from('meeting_minutes').select('id').eq('id', freshArgs.p_minute.id);
    expect(ghost.error).toBeNull();
    expect(ghost.data).toEqual([]);
  });

  it('sem vínculo não vê ata nem ações', async () => {
    for (const table of ['meeting_minutes', 'meeting_actions']) {
      const control = await admin.from(table).select('id', { count: 'exact', head: true }).eq('project_id', P.id);
      expect(control.error).toBeNull();
      expect(control.count).toBeGreaterThanOrEqual(1);

      const { data, error } = await D.client.from(table).select('*').eq('project_id', P.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    const rpc = await save(D, rpcArgs({ title: 'do estranho' }, [action()]));
    expect(rpc.error?.code).toBe('42501');
  });

  it('cliente não escreve meeting_actions direto', async () => {
    const x = await save(A, rpcArgs({ title: 'Ata com ação' }, [action({ description: 'intacta' })]));
    expect(x.error).toBeNull();
    const [row] = await actionsOfMinute(x.data.id);

    const ins = await A.client.from('meeting_actions').insert({
      id: randomUUID(),
      minute_id: x.data.id,
      project_id: P.id,
      workspace_id: wsA.id,
      description: 'direto',
      status: 'aberta',
      position: 2,
    });
    expect(ins.error?.code).toBe('42501');

    const upd = await A.client.from('meeting_actions').update({ description: 'mudada' }).eq('id', row.id);
    expect(upd.error?.code).toBe('42501');
    const del = await A.client.from('meeting_actions').delete().eq('id', row.id);
    expect(del.error?.code).toBe('42501');

    expect((await actionsOfMinute(x.data.id)).map((a) => a.description)).toEqual(['intacta']);
  });

  it('apagar tarefa ligada mantém a ação', async () => {
    const T = await createTask(A, P, { name: 'Tarefa da ação' });
    const linked = action({ description: 'Virou tarefa', task_id: T.id });
    const m = await save(A, rpcArgs({ title: 'Ata com tarefa' }, [linked]));
    expect(m.error).toBeNull();
    expect((await actionsOfMinute(m.data.id))[0].task_id).toBe(T.id);

    const del = await A.client.from('tasks').delete().eq('id', T.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);

    const { data, error } = await admin
      .from('meeting_actions')
      .select('id, task_id, project_id, description')
      .eq('id', linked.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: linked.id, task_id: null, project_id: P.id, description: 'Virou tarefa' });
  });

  it('busca com caracteres especiais não quebra', async () => {
    const hit = await save(
      A,
      rpcArgs({ title: 'Concretagem', content_text: 'Laje do bloco B\nUsar concreto usinado fck 30' }),
    );
    expect(hit.error).toBeNull();
    const miss = await save(A, rpcArgs({ title: 'Outra ata', content_text: 'Pintura da fachada' }));
    expect(miss.error).toBeNull();

    // Mesma consulta de listMinutes.
    const search = (q) =>
      A.client
        .from('meeting_minutes')
        .select('id, title, meeting_at, location, updated_at')
        .eq('project_id', P.id)
        .textSearch('search_tsv', q, { type: 'websearch', config: 'portuguese' })
        .order('meeting_at', { ascending: false });

    // Texto que parece SQL injetado é barrado pelo WAF da borda antes do PostgREST,
    // então não entra aqui; vírgula, parênteses, %, aspas e operadores de tsquery sim.
    for (const q of ['status, (urgente) 100%', '"aspas sem fim', 'a & b | !c <-> d:*']) {
      const { error } = await search(q);
      expect(error, q).toBeNull();
    }

    const found = await search('concreto');
    expect(found.error).toBeNull();
    expect(found.data.map((r) => r.id)).toEqual([hit.data.id]);
  });

  it('created_by e projeto da ata não vêm do cliente', async () => {
    const forged = await A.client.from('meeting_minutes').insert({
      id: randomUUID(),
      workspace_id: wsA.id,
      project_id: P.id,
      title: 'forjada',
      created_by: B.id,
    });
    expect(forged.error?.code).toBe('42501');

    const m = await save(A, rpcArgs({ title: 'Ata que fica em P' }, [action()]));
    expect(m.error).toBeNull();

    // Reenviar a mesma ata apontando para Q (A também é dono de Q) não a move.
    const moved = await save(A, rpcArgs({ id: m.data.id, project_id: Q.id, title: 'movida' }, []));
    expect(moved.error?.code).toBe('42501');
    expect(moved.error?.message).toBe('project_id não pode ser alterado');

    const direct = await A.client.from('meeting_minutes').update({ project_id: Q.id }).eq('id', m.data.id);
    expect(direct.error?.code).toBe('42501');

    const { data, error } = await admin.from('meeting_minutes').select('project_id, title, created_by').eq('id', m.data.id).single();
    expect(error).toBeNull();
    expect(data).toEqual({ project_id: P.id, title: 'Ata que fica em P', created_by: A.id });
    expect(await actionsOfMinute(m.data.id)).toHaveLength(1);
  });

  it('payload do app salva pela RPC', async () => {
    // Modelo real de "Reunião de status", com os ids das ações preenchidos como no app.
    const template = MINUTE_TEMPLATES.find((t) => t.id === 'status');
    const content = dedupeActionIds(template.doc, randomUUID);
    const blocks = content.content;
    const actionIndex = blocks.findIndex((n) => n.type === 'actionItem');
    blocks[actionIndex] = {
      ...blocks[actionIndex],
      attrs: { ...blocks[actionIndex].attrs, ownerName: 'Carla', dueDate: '2026-11-20' },
      content: [{ type: 'text', text: 'Enviar cronograma revisado' }],
    };
    blocks.splice(actionIndex + 1, 0, {
      type: 'actionItem',
      attrs: { id: randomUUID(), ownerName: '', dueDate: null, status: 'concluída', taskId: null },
      content: [{ type: 'text', text: 'Fechar medição' }],
    });
    blocks[1] = { type: 'paragraph', content: [{ type: 'text', text: 'Concretagem da laje' }] };

    const minute = {
      id: randomUUID(),
      projectId: P.id,
      title: 'Reunião de status semanal',
      meetingAt: '2026-11-04T09:00',
      location: 'Canteiro',
      participants: 'Ana, Bruno',
      template: 'status',
      content,
    };
    const args = minuteToRpcArgs(minute, wsA.id);
    expect(args.p_actions).toHaveLength(2);

    const { data, error } = await A.client.rpc('save_meeting_minute', args).single();
    expect(error).toBeNull();
    const saved = minuteFromRow(data);
    expect(saved).toMatchObject({
      id: minute.id,
      projectId: P.id,
      title: minute.title,
      location: 'Canteiro',
      participants: 'Ana, Bruno',
      template: 'status',
      content: args.p_minute.content,
    });
    expect(saved.meetingAt.slice(0, 16)).toBe('2026-11-04T09:00');
    expect(data.content_text).toBe(args.p_minute.content_text);
    expect(data.workspace_id).toBe(wsA.id);
    expect(data.created_by).toBe(A.id);

    // Mesma consulta de listProjectActions, filtrada pela ata.
    const rows = await A.client
      .from('meeting_actions')
      .select('*')
      .eq('project_id', P.id)
      .eq('minute_id', minute.id)
      .order('position');
    expect(rows.error).toBeNull();
    expect(rows.data.map(actionFromRow)).toEqual([
      {
        id: args.p_actions[0].id,
        minuteId: minute.id,
        projectId: P.id,
        description: 'Enviar cronograma revisado',
        ownerName: 'Carla',
        dueDate: '2026-11-20',
        status: 'aberta',
        taskId: null,
        position: 1,
      },
      {
        id: args.p_actions[1].id,
        minuteId: minute.id,
        projectId: P.id,
        description: 'Fechar medição',
        ownerName: '',
        dueDate: null,
        status: 'concluída',
        taskId: null,
        position: 2,
      },
    ]);

    // Recarregar como loadMinute: o documento volta igual.
    const reloaded = await A.client.from('meeting_minutes').select('*').eq('id', minute.id).single();
    expect(reloaded.error).toBeNull();
    expect(minuteFromRow(reloaded.data).content).toEqual(args.p_minute.content);
  });

  // meeting_actions é projeção do documento: texto longo é cortado, o save não cai.
  it('ação com texto longo salva cortada', async () => {
    const description = 'ação '.repeat(300); // 1500 caracteres, com acento
    const ownerName = 'Responsável '.repeat(25); // 300 caracteres
    expect(description).toHaveLength(1500);
    expect(ownerName).toHaveLength(300);
    const long = action({ description, owner_name: ownerName });

    const m = await save(A, rpcArgs({ title: 'Ata com ação longa' }, [long]));
    expect(m.error).toBeNull();

    const [row] = await actionsOfMinute(m.data.id);
    expect(row.id).toBe(long.id);
    expect(row.description).toBe(description.slice(0, 1000));
    expect(row.owner_name).toBe(ownerName.slice(0, 200));
  });

  // Tarefa apagada em outra aba ou aparelho: o vínculo some, o save não cai.
  it('ação com tarefa já apagada salva sem vínculo', async () => {
    const gone = await createTask(A, P, { name: 'Tarefa apagada antes' });
    const del = await A.client.from('tasks').delete().eq('id', gone.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
    const live = await createTask(A, P, { name: 'Tarefa viva' });
    const other = await createTask(A, Q, { name: 'Tarefa de Q' });

    const toGone = action({ description: 'aponta para apagada', task_id: gone.id });
    const toLive = action({ description: 'aponta para viva', task_id: live.id });
    const toOther = action({ description: 'aponta para outro projeto', task_id: other.id });
    const m = await save(A, rpcArgs({ title: 'Ata com vínculo pendurado' }, [toGone, toLive, toOther]));
    expect(m.error).toBeNull();

    expect((await actionsOfMinute(m.data.id)).map((a) => [a.id, a.task_id])).toEqual([
      [toGone.id, null],
      [toLive.id, live.id],
      [toOther.id, null],
    ]);
  });

  it('p_actions nulo é recusado sem apagar nada', async () => {
    const kept = action({ description: 'continua' });
    const m = await save(A, rpcArgs({ title: 'Ata antes do nulo' }, [kept]));
    expect(m.error).toBeNull();

    const res = await save(A, rpcArgs({ id: m.data.id, title: 'depois do nulo' }, null));
    expect(res.error?.code).toBe('22023');

    // A transação inteira volta: nem o título nem as ações mudam.
    const { data, error } = await admin.from('meeting_minutes').select('title').eq('id', m.data.id).single();
    expect(error).toBeNull();
    expect(data.title).toBe('Ata antes do nulo');
    expect((await actionsOfMinute(m.data.id)).map((a) => a.id)).toEqual([kept.id]);
  });

  it('editor salva a ata do dono e o autor continua o dono', async () => {
    const m = await save(A, rpcArgs({ title: 'Ata do dono' }, [action({ description: 'do dono' })]));
    expect(m.error).toBeNull();
    expect(m.data.created_by).toBe(A.id);

    const edited = action({ description: 'do editor' });
    const res = await save(C, rpcArgs({ id: m.data.id, title: 'Ata revisada pelo editor' }, [edited]));
    expect(res.error).toBeNull();
    expect(res.data.title).toBe('Ata revisada pelo editor');

    const { data, error } = await admin
      .from('meeting_minutes')
      .select('title, created_by, created_at')
      .eq('id', m.data.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ title: 'Ata revisada pelo editor', created_by: A.id, created_at: m.data.created_at });
    expect((await actionsOfMinute(m.data.id)).map((a) => a.description)).toEqual(['do editor']);
  });

  // Na busca (GET), o WAF da borda barrou este texto antes do PostgREST.
  it('texto que parece SQL salva pela RPC', async () => {
    const sqlish = "'; drop table meeting_minutes; --";
    const args = rpcArgs({ title: `Ata ${sqlish}`, content_text: `Nota: ${sqlish}` }, [action({ description: sqlish })]);
    const res = await save(A, args);
    expect(res.error, `HTTP ${res.status}`).toBeNull();
    expect(res.data.title).toBe(`Ata ${sqlish}`);
    expect(res.data.content_text).toBe(`Nota: ${sqlish}`);
    expect((await actionsOfMinute(args.p_minute.id)).map((a) => a.description)).toEqual([sqlish]);
  });
});
