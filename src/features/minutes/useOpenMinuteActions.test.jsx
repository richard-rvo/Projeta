// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../../context/AppContext'
import { useOpenMinuteActions } from './useOpenMinuteActions'
import { listProjectActions, loadMinute, saveMinute } from './minutesRepository'
import { extractActions } from './minuteDoc'

vi.mock('./minutesRepository', () => ({
  listProjectActions: vi.fn(), loadMinute: vi.fn(), saveMinute: vi.fn(),
}))

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })

let hook, root, container
function Probe({ projectId }) {
  hook = useOpenMinuteActions(projectId)
  return null
}

const showToast = vi.fn()
function ui(projectId, tasks = []) {
  const ctx = { state: { tasks, auth: { workspace: { id: 'w1' } } }, showToast }
  return <AppContext.Provider value={ctx}><Probe projectId={projectId} /></AppContext.Provider>
}

async function mount(projectId, tasks) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await run(() => root.render(ui(projectId, tasks)))
}

afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

const action = (id, minuteId, projectId) => ({ id, minuteId, projectId, description: id, dueDate: null, status: 'aberta', taskId: null })

describe('useOpenMinuteActions', () => {
  it('ignora a resposta atrasada de um projeto anterior', async () => {
    let releaseP1
    listProjectActions.mockImplementation((projectId) => (projectId === 'p1'
      ? new Promise((res) => { releaseP1 = () => res([action('a1', 'm1', 'p1')]) })
      : Promise.resolve([action('a2', 'm2', 'p2')])))
    await mount('p1')
    await run(() => root.render(ui('p2')))
    expect(hook.actions.map((a) => a.id)).toEqual(['a2'])
    await run(() => releaseP1())
    expect(hook.actions.map((a) => a.id)).toEqual(['a2'])
    expect(hook.loading).toBe(false)
  })

  it('Concluir confere os vínculos contra as tarefas do projeto da própria ata', async () => {
    listProjectActions.mockResolvedValue([action('a1', 'm1', 'p2')])
    const node = (id, taskId) => ({ type: 'actionItem', attrs: { id, status: 'aberta', taskId }, content: [] })
    loadMinute.mockResolvedValue({
      id: 'm1', projectId: 'p2', content: { type: 'doc', content: [node('a1', 't2'), node('a2', 't1')] },
    })
    saveMinute.mockResolvedValue({})
    const tasks = [{ id: 't1', projectId: 'p1' }, { id: 't2', projectId: 'p2' }]
    await mount('p1', tasks)
    await run(() => hook.complete(action('a1', 'm1', 'p2')))
    const saved = extractActions(saveMinute.mock.calls[0][0].content)
    expect(saved.map((a) => [a.id, a.status, a.taskId])).toEqual([
      ['a1', 'concluída', 't2'],
      ['a2', 'aberta', null],
    ])
  })
})
