// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../context/AppContext'
import PageProjectOverview from './PageProjectOverview'
import { listProjectActions, loadMinute, saveMinute } from '../features/minutes/minutesRepository'
import { extractActions } from '../features/minutes/minuteDoc'

vi.mock('../features/minutes/minutesRepository', () => ({
  listProjectActions: vi.fn(), loadMinute: vi.fn(), saveMinute: vi.fn(),
}))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })

let root, container
afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

const act_ = (n, dueDate, extra = {}) => ({
  id: `a${n}`, minuteId: `m${n}`, description: `Ação ${n}`, ownerName: 'Ana', dueDate, status: 'aberta', taskId: null, ...extra,
})

async function render(actions, { tasks = [] } = {}) {
  listProjectActions.mockResolvedValue(actions)
  const ctx = {
    state: {
      activeProjectId: 'p1', projects: [{ id: 'p1', name: 'Obra' }], tasks, anomalies: [],
      auth: { workspace: { id: 'w1' } },
    },
    setProjectTab: vi.fn(), openTaskInspector: vi.fn(), openMinuteFromOverview: vi.fn(), showToast: vi.fn(),
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await run(() => root.render(<AppContext.Provider value={ctx}><PageProjectOverview /></AppContext.Provider>))
  return ctx
}

const card = () => [...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === 'Ações abertas')

describe('cartão Ações abertas', () => {
  it('mostra no máximo 6 por prazo (sem prazo por último) e marca vencidas', async () => {
    const list = [
      act_(1, null), act_(2, '2099-01-05'), act_(3, '2000-01-01'), act_(4, '2099-01-03'),
      act_(5, '2099-01-04'), act_(6, '2099-01-06'), act_(7, '2099-01-07'),
    ]
    await render(list)
    expect(listProjectActions).toHaveBeenCalledWith('p1', { status: 'aberta' })
    const rows = [...card().querySelectorAll('li')]
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.textContent.match(/Ação \d/)[0])).toEqual(
      ['Ação 3', 'Ação 4', 'Ação 5', 'Ação 2', 'Ação 6', 'Ação 7'])
    expect(rows[0].textContent).toContain('Atrasada')
    expect(rows[1].textContent).not.toContain('Atrasada')
    expect(rows[0].querySelector('.text-sched-late')).toBeTruthy()
  })

  it('vazio mostra mensagem', async () => {
    await render([])
    expect(card().textContent).toContain('Nenhuma ação aberta.')
  })

  it('Concluir limpa vínculos órfãos e salva a ação como concluída', async () => {
    const node = (id, attrs) => ({ type: 'actionItem', attrs: { id, status: 'aberta', taskId: null, ...attrs }, content: [] })
    loadMinute.mockResolvedValue({
      id: 'm1', content: { type: 'doc', content: [node('a1', {}), node('a2', { taskId: 'gone' })] },
    })
    saveMinute.mockResolvedValue({})
    await render([act_(1, '2099-01-01')])
    const concluir = [...card().querySelectorAll('button')].find((b) => b.textContent === 'Concluir')
    await run(() => { concluir.click(); concluir.click() })
    expect(loadMinute).toHaveBeenCalledWith('m1')
    expect(saveMinute).toHaveBeenCalledTimes(1)
    const [saved, ws] = saveMinute.mock.calls[0]
    expect(ws).toBe('w1')
    const actions = extractActions(saved.content)
    expect(actions.map((a) => a.status)).toEqual(['concluída', 'aberta'])
    expect(actions[1].taskId).toBeNull()
    expect(card().querySelectorAll('li')).toHaveLength(0)
  })

  it('clicar na linha abre a ata de origem', async () => {
    const ctx = await render([act_(3, '2099-01-01')])
    const open = [...card().querySelectorAll('button')].find((b) => b.textContent.includes('Ação 3') && b.textContent !== 'Concluir')
    await run(() => open.click())
    expect(ctx.openMinuteFromOverview).toHaveBeenCalledWith('m3')
  })

  it('erro ao carregar mostra toast amigável', async () => {
    listProjectActions.mockRejectedValue(new Error('x'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const showToast = vi.fn()
    const ctx = {
      state: { activeProjectId: 'p1', projects: [{ id: 'p1', name: 'Obra' }], tasks: [], anomalies: [], auth: {} },
      setProjectTab: vi.fn(), openTaskInspector: vi.fn(), openMinuteFromOverview: vi.fn(), showToast,
    }
    await run(() => root.render(<AppContext.Provider value={ctx}><PageProjectOverview /></AppContext.Provider>))
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(card().textContent).toContain('Nenhuma ação aberta.')
  })
})
