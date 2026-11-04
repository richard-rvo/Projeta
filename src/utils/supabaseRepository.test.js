import { describe, it, expect } from 'vitest';
import { projectFromRow, taskFromRow, anomalyFromRow, friendlyDbError } from './supabaseRepository';

describe('mapeamento de linhas', () => {
  it('projectFromRow mantém o id da linha mesmo com metadata.id', () => {
    const p = projectFromRow({ id: 'p1', name: 'A', metadata: { id: 'x', workspaceId: 'w' } });
    expect(p.id).toBe('p1');
  });
  it('taskFromRow mantém projectId e id', () => {
    const t = taskFromRow({ id: 't1', project_id: 'p1', metadata: { projectId: 'x', id: 'y' } });
    expect(t.id).toBe('t1');
    expect(t.projectId).toBe('p1');
  });
  it('anomalyFromRow mantém id e projectId', () => {
    const a = anomalyFromRow({ id: 'a1', project_id: 'p1', metadata: { projectId: 'x', id: 'y' } });
    expect(a.id).toBe('a1');
    expect(a.projectId).toBe('p1');
  });
});

describe('friendlyDbError', () => {
  it('traduz o limite de plano', () => {
    expect(friendlyDbError({ message: 'plan_limit_projects' })).toBe('Você atingiu o limite de projetos do seu plano.');
  });
  it('traduz permissão negada', () => {
    expect(friendlyDbError({ code: '42501' })).toBe('Você não tem permissão para esta ação.');
  });
  it('traduz restrição de dados', () => {
    expect(friendlyDbError({ code: '23514' })).toBe('Algum campo está fora do formato ou do tamanho permitido.');
  });
});
