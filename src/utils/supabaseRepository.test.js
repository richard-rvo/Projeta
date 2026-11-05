import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  projectFromRow, taskFromRow, anomalyFromRow, friendlyDbError, toFriendlyError, throwIfError,
} from './supabaseRepository';

afterEach(() => vi.restoreAllMocks());

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

  const OFFLINE = 'Sem conexão. Verifique a internet e tente de novo.';
  it('traduz falha de rede (status 0)', () => {
    expect(friendlyDbError({ status: 0, message: 'x' })).toBe(OFFLINE);
  });
  it('traduz falha de rede (TypeError)', () => {
    expect(friendlyDbError(new TypeError('boom'))).toBe(OFFLINE);
  });
  it.each(['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'traduz falha de rede pela mensagem "%s"',
    (message) => {
      expect(friendlyDbError({ message, code: '' })).toBe(OFFLINE);
    },
  );
  it('traduz vínculo inexistente (23503)', () => {
    expect(friendlyDbError({ code: '23503', message: 'insert or update violates foreign key' }))
      .toBe('Um item vinculado não existe mais. Recarregue a página.');
  });

  const REFUSED = 'O servidor recusou a solicitação. Tente de novo com outro texto.';
  it('traduz corpo HTML (começa com <)', () => {
    expect(friendlyDbError({ message: '<!DOCTYPE html><title>Blocked</title>' })).toBe(REFUSED);
  });
  it('traduz corpo HTML (contém <html)', () => {
    expect(friendlyDbError({ message: 'Request rejected <HTML><body>WAF</body></html>' })).toBe(REFUSED);
  });
  it('traduz 403 sem código do Postgres', () => {
    expect(friendlyDbError({ status: 403, message: 'Forbidden' })).toBe(REFUSED);
  });
  it('403 com código do Postgres segue o código', () => {
    expect(friendlyDbError({ status: 403, code: '42501', message: 'denied' })).toBe('Você não tem permissão para esta ação.');
  });

  it('código desconhecido usa a mensagem padrão em português, nunca o texto cru, e registra o erro uma vez', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { code: 'XX000', message: 'internal error: something English' };
    expect(friendlyDbError(raw)).toBe('Não foi possível concluir a operação. Tente de novo.');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toContain(raw);
  });
  it('sem erro algum também cai na mensagem padrão', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(friendlyDbError(undefined)).toBe('Não foi possível concluir a operação. Tente de novo.');
  });
});

describe('toFriendlyError', () => {
  it('troca a mensagem pela tradução e preserva código e causa', () => {
    const raw = { code: '23514', message: 'new row violates check constraint "projects_name_length"' };
    const error = toFriendlyError(raw);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Algum campo está fora do formato ou do tamanho permitido.');
    expect(error.code).toBe('23514');
    expect(error.cause).toBe(raw);
  });
  it('traduz o limite de plano sem expor o identificador', () => {
    const error = toFriendlyError({ code: 'P0001', message: 'plan_limit_projects' });
    expect(error.message).toBe('Você atingiu o limite de projetos do seu plano.');
    expect(error.message).not.toContain('plan_limit_projects');
  });
  it('é idempotente: um erro já traduzido passa igual por friendlyDbError e toFriendlyError', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const once = toFriendlyError({ code: 'P0001', message: 'plan_limit_projects' });
    expect(friendlyDbError(once)).toBe(once.message);
    expect(toFriendlyError(once)).toBe(once);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('throwIfError', () => {
  it('devolve data quando não há erro', () => {
    expect(throwIfError({ data: [1], error: null, status: 200 })).toEqual([1]);
  });
  it('lança o erro com o status HTTP da resposta (para friendlyDbError reconhecer 403)', () => {
    let thrown;
    try { throwIfError({ data: null, error: { message: 'Forbidden' }, status: 403 }); } catch (e) { thrown = e; }
    expect(thrown).toMatchObject({ message: 'Forbidden', status: 403 });
    expect(friendlyDbError(thrown)).toBe('O servidor recusou a solicitação. Tente de novo com outro texto.');
  });
});
