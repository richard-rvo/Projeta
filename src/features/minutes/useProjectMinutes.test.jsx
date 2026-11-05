// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../../context/AppContext'
import { useProjectMinutes } from './useProjectMinutes'
import { listMinutes, loadMinute, saveMinute } from './minutesRepository'
import { flushAllMinuteSaves, hasPendingMinuteSaves } from './pendingSaves'

vi.mock('./minutesRepository', async (importOriginal) => ({
  ...(await importOriginal()),
  listMinutes: vi.fn(), loadMinute: vi.fn(), saveMinute: vi.fn(), deleteMinute: vi.fn(),
}))

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })
const OFFLINE = { message: 'TypeError: Failed to fetch', code: '' }

let hook, root, container
function Probe() {
  hook = useProjectMinutes('p1')
  return null
}

async function mount() {
  listMinutes.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const ctx = { state: { auth: { workspace: { id: 'w1' } } } }
  await run(() => root.render(<AppContext.Provider value={ctx}><Probe /></AppContext.Provider>))
}

async function unmount() {
  await run(() => root.unmount())
  container.remove()
  root = null
}

afterEach(async () => {
  if (root) await unmount()
  saveMinute.mockResolvedValue({})
  await flushAllMinuteSaves()
  vi.clearAllMocks()
})

describe('useProjectMinutes: sair da tela com texto não salvo', () => {
  it('desmontar com o save falhando mantém o texto pendente até gravar', async () => {
    await mount()
    saveMinute.mockResolvedValueOnce({})
    await run(() => hook.createMinute('blank'))
    saveMinute.mockRejectedValue(OFFLINE)
    await run(() => hook.updateActiveMinute({ title: 'Texto importante' }))
    await unmount()
    expect(saveMinute).toHaveBeenCalledTimes(2) // criação + flush do desmonte (falhou)
    expect(hasPendingMinuteSaves()).toBe(true)

    saveMinute.mockResolvedValue({})
    expect(await flushAllMinuteSaves()).toBe(true)
    expect(saveMinute).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Texto importante' }), 'w1')
    expect(hasPendingMinuteSaves()).toBe(false)
  })

  it('ao abrir uma ata, grava antes o texto órfão (para não carregar a versão velha)', async () => {
    await mount()
    saveMinute.mockResolvedValueOnce({})
    await run(() => hook.createMinute('blank'))
    const minuteId = hook.activeMinute.id
    saveMinute.mockRejectedValue(OFFLINE)
    await run(() => hook.updateActiveMinute({ title: 'Versão nova' }))
    await unmount()
    expect(hasPendingMinuteSaves()).toBe(true)

    saveMinute.mockResolvedValue({})
    loadMinute.mockResolvedValue({ id: minuteId, projectId: 'p1', title: 'Versão nova', content: { type: 'doc', content: [] } })
    await mount()
    await run(() => hook.openMinute(minuteId))
    expect(hasPendingMinuteSaves()).toBe(false)
    const lastSave = saveMinute.mock.invocationCallOrder.at(-1)
    expect(lastSave).toBeLessThan(loadMinute.mock.invocationCallOrder[0])
    expect(saveMinute).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Versão nova' }), 'w1')
  })
})
