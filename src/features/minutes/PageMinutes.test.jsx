// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../../context/AppContext'
import PageMinutes from './PageMinutes'
import { useProjectMinutes } from './useProjectMinutes'
import { buildNewTask } from '../../utils/taskFactory'
import { extractActions } from './minuteDoc'
import { friendlyError } from '../../utils/supabaseRepository'

vi.mock('./useProjectMinutes', () => ({ useProjectMinutes: vi.fn() }))
vi.mock('./editor/MinuteEditor', () => ({
  default: ({ onContentError, onCreateTask }) => (
    <>
      <button type="button" data-testid="editor" onClick={() => onContentError(new Error('x'))} />
      <button type="button" data-testid="editor-create" onClick={() => onCreateTask('a1')} />
    </>
  ),
}))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })

let root, container
afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
})

const base = () => ({
  minutes: [], query: '', setQuery: vi.fn(), activeMinute: null, openMinute: vi.fn().mockResolvedValue(undefined),
  createMinute: vi.fn().mockResolvedValue(null), updateActiveMinute: vi.fn(),
  removeMinute: vi.fn(), retrySave: vi.fn(), flushNow: vi.fn().mockResolvedValue(true), saveStatus: 'idle', loading: false, error: '',
})

async function render(overrides, ctxOverrides = {}) {
  const hook = { ...base(), ...overrides }
  useProjectMinutes.mockReturnValue(hook)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const ctx = {
    state: { activeProjectId: 'p1', projects: [], tasks: [] },
    showToast: vi.fn(), openTaskInspector: vi.fn(), clearFocusMinute: vi.fn(), addTask: vi.fn(),
    ...ctxOverrides,
  }
  await run(() => root.render(<AppContext.Provider value={ctx}><PageMinutes /></AppContext.Provider>))
  hook.ctx = ctx
  return hook
}

const byText = (text) => [...document.body.querySelectorAll('button,span,p,h2')].find((el) => el.textContent.trim() === text)

const minute = (id, title, meetingAt) => ({ id, title, meetingAt, location: 'Obra' })

describe('PageMinutes', () => {
  it('estado vazio cria a primeira ata pelo modelo de status', async () => {
    const hook = await render()
    expect(document.body.textContent).toContain('Nenhuma ata neste projeto')
    await run(() => byText('Criar a primeira ata').click())
    expect(hook.createMinute).toHaveBeenCalledWith('status')
  })

  it('agrupa a lista por mês', async () => {
    await render({ minutes: [minute('a', 'Ata A', '2026-11-04T09:00'), minute('b', 'Ata B', '2026-10-01T10:00')] })
    const headers = [...document.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headers).toEqual(['Novembro de 2026', 'Outubro de 2026'])
    expect(document.body.textContent).toContain('04/11 09:00')
  })

  it.each([
    ['saving', 'Salvando…'],
    ['pending', 'Salvando…'],
    ['saved', 'Salvo'],
  ])('indicador %s mostra %s', async (status, label) => {
    await render({ saveStatus: status, minutes: [minute('a', 'A', '2026-11-04T09:00')] })
    expect(byText(label)).toBeTruthy()
  })

  it('erro de salvamento permite tentar de novo', async () => {
    const hook = await render({ saveStatus: 'error', minutes: [minute('a', 'A', '2026-11-04T09:00')] })
    await run(() => byText('Erro ao salvar — tentar de novo').click())
    expect(hook.retrySave).toHaveBeenCalled()
  })

  it('Excluir pede confirmação e remove a ata', async () => {
    const hook = await render({ minutes: [minute('a', 'Ata A', '2026-11-04T09:00')] })
    const trigger = document.querySelector('[aria-label^="Ações da ata"]')
    await run(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Excluir')
    await run(() => item.click())
    expect(hook.removeMinute).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Excluir')
    await run(() => confirm.click())
    expect(hook.removeMinute).toHaveBeenCalledWith('a')
  })

  it('não mostra o estado vazio enquanto carrega', async () => {
    await render({ loading: true })
    expect(byText('Criar a primeira ata')).toBeUndefined()
    expect(document.body.textContent).toContain('Carregando atas…')
  })

  it('sem ata aberta, a lista fica acessível e o painel principal oculto no celular', async () => {
    await render({ minutes: [minute('a', 'Ata A', '2026-11-04T09:00')] })
    expect(document.querySelector('aside').className).toContain('flex')
    expect(document.querySelector('aside').className).not.toContain('hidden')
    expect(document.querySelector('main').className).toContain('hidden')
  })

  it('erro de conteúdo da ata mostra aviso', async () => {
    const m = { ...minute('a', 'Ata A', '2026-11-04T09:00'), content: {}, participants: '' }
    const hook = await render({ minutes: [m], activeMinute: m })
    await run(() => document.querySelector('[data-testid="editor"]').click())
    expect(hook.ctx.showToast).toHaveBeenCalledWith(
      'Esta ata não pôde ser aberta para edição. Recarregue a página.', 'error')
  })

  describe('ações', () => {
    const project = { id: 'p1', name: 'Obra', calendars: [] }
    const actionNode = (id, text, attrs = {}) => ({
      type: 'actionItem',
      attrs: { id, ownerName: 'Ana', dueDate: '2026-11-10', status: 'aberta', taskId: null, ...attrs },
      content: [{ type: 'text', text }],
    })
    const withActions = (...nodes) => ({
      ...minute('a', 'Ata A', '2026-11-04T09:00'), participants: '',
      content: { type: 'doc', content: nodes },
    })
    const ctxFor = (extra = {}) => ({
      state: { activeProjectId: 'p1', projects: [project], tasks: [], ...extra },
    })

    it('Criar tarefa chama addTask com a fábrica e grava o taskId; clique duplo vale um', async () => {
      let release
      const addTask = vi.fn(() => new Promise((res) => { release = res }))
      const m = withActions(actionNode('a1', 'Comprar flanges'))
      const hook = await render({ minutes: [m], activeMinute: m }, { ...ctxFor(), addTask })
      const click = () => document.querySelector('[data-testid="editor-create"]').click()
      await run(() => { click(); click() })
      expect(addTask).toHaveBeenCalledTimes(1)
      const task = addTask.mock.calls[0][0]
      expect(task).toMatchObject({
        ...buildNewTask(project, { name: 'Comprar flanges', order: 0, startDay: '2026-11-10', workingDays: 1 }),
        id: task.id,
      })
      await run(() => release())
      const { content } = hook.updateActiveMinute.mock.calls.at(-1)[0]
      expect(extractActions(content)[0].taskId).toBe(task.id)
    })

    it('falha ao criar tarefa mostra erro e não altera o documento', async () => {
      // addTask passa por withPersistence, que já relança o erro traduzido.
      const addTask = vi.fn().mockRejectedValue(friendlyError('Você não tem permissão para esta ação.'))
      const m = withActions(actionNode('a1', 'X'))
      const hook = await render({ minutes: [m], activeMinute: m }, { ...ctxFor(), addTask })
      await run(() => document.querySelector('[data-testid="editor-create"]').click())
      expect(hook.ctx.showToast).toHaveBeenCalledWith(
        'Não foi possível criar a tarefa. Você não tem permissão para esta ação.', 'error')
      expect(hook.updateActiveMinute).not.toHaveBeenCalled()
    })

    it('limpa taskId pendurado ao abrir a ata', async () => {
      const m = withActions(actionNode('a1', 'X', { taskId: 'gone' }), actionNode('a2', 'Y', { taskId: 't1' }))
      const hook = await render({ minutes: [m], activeMinute: m }, ctxFor({ tasks: [{ id: 't1', projectId: 'p1' }] }))
      expect(hook.updateActiveMinute).toHaveBeenCalledTimes(1)
      const actions = extractActions(hook.updateActiveMinute.mock.calls[0][0].content)
      expect(actions.map((a) => a.taskId)).toEqual([null, 't1'])
    })

    it('não grava nada quando os vínculos estão íntegros', async () => {
      const m = withActions(actionNode('a1', 'X', { taskId: 't1' }))
      const hook = await render({ minutes: [m], activeMinute: m }, ctxFor({ tasks: [{ id: 't1', projectId: 'p1' }] }))
      expect(hook.updateActiveMinute).not.toHaveBeenCalled()
    })

    it('painel lista abertas por padrão, alterna para Todas e recolhe', async () => {
      const m = withActions(actionNode('a1', 'Aberta um'), actionNode('a2', 'Feita dois', { status: 'concluída' }))
      await render({ minutes: [m], activeMinute: m }, ctxFor())
      const panel = () => document.querySelector('aside[aria-label="Ações da ata"]')
      expect(panel().textContent).toContain('Aberta um')
      expect(panel().textContent).not.toContain('Feita dois')
      await run(() => byText('Todas').click())
      expect(panel().textContent).toContain('Feita dois')
      const toggle = document.querySelector('button[aria-expanded]')
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      await run(() => toggle.click())
      expect(panel()).toBeNull()
    })

    it('consome focusMinuteId uma vez: abre a ata e limpa o foco', async () => {
      const hook = await render({}, { ...ctxFor({ focusMinuteId: 'm9' }) })
      expect(hook.openMinute).toHaveBeenCalledWith('m9')
      expect(hook.ctx.clearFocusMinute).toHaveBeenCalledTimes(1)
    })
  })

  it('Imprimir / PDF fica desabilitado sem ata e, com ata, grava o pendente antes da pré-visualização', async () => {
    await render()
    expect(byText('Imprimir / PDF')?.disabled ?? true).toBe(true)
    await run(() => root.unmount())
    container.remove()
    const hook = await render({
      activeMinute: { id: 'm1', title: 'T', meetingAt: '2026-11-04T09:00', location: '', participants: '', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      flushNow: vi.fn().mockResolvedValue(true),
    })
    await run(() => byText('Imprimir / PDF').click())
    expect(hook.flushNow).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Voltar à edição')
    await run(() => byText('Voltar à edição').click())
    expect(document.body.textContent).not.toContain('Voltar à edição')
  })

  it('não abre a pré-visualização se o save pendente falhou', async () => {
    await render({
      activeMinute: { id: 'm1', title: 'T', meetingAt: '2026-11-04T09:00', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      flushNow: vi.fn().mockResolvedValue(false),
    })
    await run(() => byText('Imprimir / PDF').click())
    expect(document.body.textContent).not.toContain('Voltar à edição')
  })
})
