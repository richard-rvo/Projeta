import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  bootstrapWorkspace,
  cleanupTestUsers,
  createProject,
  createTask,
  createTestUser,
} from './helpers.js';

const todayUtc = () => new Date().toISOString().slice(0, 10);

describe('workspaces, membros e perfis', () => {
  let A;
  let B;
  let wsA;
  let wsB;
  let admin;

  beforeAll(async () => {
    admin = adminClient();
    A = await createTestUser('ws-a');
    B = await createTestUser('ws-b');
    wsA = await bootstrapWorkspace(A);
    wsB = await bootstrapWorkspace(B);
  });

  afterAll(cleanupTestUsers);

  it('dono não adiciona outro usuário como membro', async () => {
    const { error } = await A.client
      .from('workspace_members')
      .insert({ workspace_id: wsA.id, user_id: B.id, role: 'member' });
    expect(error?.code).toBe('42501');
    const { data } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', wsA.id)
      .eq('user_id', B.id);
    expect(data).toEqual([]);
  });

  it('dono não transfere a posse do workspace', async () => {
    const { error } = await A.client.from('workspaces').update({ owner_id: B.id }).eq('id', wsA.id);
    expect(error?.code).toBe('42501');
    const { data, error: readErr } = await admin.from('workspaces').select('owner_id').eq('id', wsA.id).single();
    expect(readErr).toBeNull();
    expect(data.owner_id).toBe(A.id);
  });

  it('usuário não muda o próprio plano', async () => {
    const { error } = await A.client.from('workspaces').update({ plan: 'pro' }).eq('id', wsA.id);
    expect(error?.code).toBe('42501');
    const { data, error: readErr } = await admin.from('workspaces').select('plan').eq('id', wsA.id).single();
    expect(readErr).toBeNull();
    expect(data.plan).toBe('free');
  });

  it('dono renomeia o workspace (controle positivo)', async () => {
    const { data, error } = await A.client
      .from('workspaces')
      .update({ name: 'Renomeado RLS', timezone: 'America/Sao_Paulo' })
      .eq('id', wsA.id)
      .select('*')
      .single();
    expect(error).toBeNull();
    expect(data.name).toBe('Renomeado RLS');
    expect(data.timezone).toBe('America/Sao_Paulo');
    expect(data.owner_id).toBe(A.id);
  });

  it('usuário não cria workspace direto', async () => {
    const { error } = await A.client.from('workspaces').insert({ name: 'Direto RLS', owner_id: A.id });
    expect(error?.code).toBe('42501');
  });

  it('usuário não grava created_at no passado', async () => {
    const project = await createProject(A, wsA.id, { created_at: '2000-01-01' });
    const { data, error } = await admin.from('projects').select('created_at').eq('id', project.id).single();
    expect(error).toBeNull();
    expect(new Date(data.created_at).toISOString().slice(0, 10)).toBe(todayUtc());
  });

  it('tarefa não muda de projeto e created_at não é reescrito (upsert do app continua)', async () => {
    const p1 = await createProject(A, wsA.id);
    const p2 = await createProject(A, wsA.id, { name: 'Projeto RLS 2' });
    const task = await createTask(A, p1);

    const move = await A.client.from('tasks').update({ project_id: p2.id }).eq('id', task.id);
    expect(move.error?.code).toBe('42501');
    expect(move.error?.message).toBe('project_id não pode ser alterado');

    const rewrite = await A.client.from('projects').update({ created_at: '2000-01-01' }).eq('id', p1.id);
    expect(rewrite.error?.code).toBe('42501');
    expect(rewrite.error?.message).toBe('created_at não pode ser alterado');

    // saveProject faz upsert com o mesmo workspace_id e sem created_at.
    const upsert = await A.client
      .from('projects')
      .upsert({ id: p1.id, workspace_id: wsA.id, name: 'Upsert RLS' })
      .select('*')
      .single();
    expect(upsert.error).toBeNull();
    expect(upsert.data.name).toBe('Upsert RLS');
    expect(upsert.data.created_at).toBe(p1.created_at);
  });

  it('anon não chama ensure_personal_workspace', async () => {
    const { data, error } = await anonClient().rpc('ensure_personal_workspace').single();
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('perfil: upsert do próprio perfil funciona e o alheio não (controle positivo)', async () => {
    const own = await A.client
      .from('profiles')
      .upsert({ id: A.id, display_name: 'Perfil RLS', avatar_url: null }, { onConflict: 'id' });
    expect(own.error).toBeNull();
    const other = await A.client
      .from('profiles')
      .upsert({ id: B.id, display_name: 'invasor', avatar_url: null }, { onConflict: 'id' });
    expect(other.error?.code).toBe('42501');
    const { data } = await admin.from('profiles').select('display_name').eq('id', B.id).single();
    expect(data.display_name).not.toBe('invasor');
  });

  it('ensure_personal_workspace é idempotente', async () => {
    const first = await A.client.rpc('ensure_personal_workspace').single();
    const second = await A.client.rpc('ensure_personal_workspace').single();
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data.id).toBe(second.data.id);
    expect(first.data.is_personal).toBe(true);
    expect(first.data.owner_id).toBe(A.id);
  });

  it('primeiro acesso de usuário novo', async () => {
    const N = await createTestUser('ws-novo');
    const { count: before } = await admin
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', N.id);
    expect(before).toBe(0);

    const { data, error } = await N.client.rpc('ensure_personal_workspace').single();
    expect(error).toBeNull();
    expect(data.owner_id).toBe(N.id);
    expect(data.is_personal).toBe(true);
    expect(data.plan).toBe('free');
    expect(data.name).toMatch(/ workspace$/);

    const membership = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', data.id)
      .eq('user_id', N.id)
      .single();
    expect(membership.error).toBeNull();
    expect(membership.data.role).toBe('owner');

    const visible = await N.client.from('workspaces').select('id').eq('id', data.id);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(1);
  });

  it('RPC ignora workspace alheio mais antigo', async () => {
    const member = await admin
      .from('workspace_members')
      .insert({ workspace_id: wsB.id, user_id: A.id, role: 'member' });
    expect(member.error).toBeNull();
    const backdate = await admin.from('workspaces').update({ created_at: '2000-01-01' }).eq('id', wsB.id);
    expect(backdate.error).toBeNull();

    const { data, error } = await A.client.rpc('ensure_personal_workspace').single();
    expect(error).toBeNull();
    expect(data.id).toBe(wsA.id);
  });
});
