// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext, AppProvider } from './AppContext'

const { auth, repo } = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
  repo: { ensureWorkspace: vi.fn(), loadWorkspaceData: vi.fn(), saveProject: vi.fn() },
}))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth } }))
vi.mock('../utils/supabaseRepository', async (importOriginal) => ({ ...(await importOriginal()), ...repo }))

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })

let ctx, root, container
function Probe() {
  ctx = useContext(AppContext)
  return null
}

const EMPTY = { projects: [], tasks: [], anomalies: [] }

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  auth.signOut.mockResolvedValue({ error: null })
  repo.ensureWorkspace.mockResolvedValue({ id: 'w1' })
  repo.loadWorkspaceData.mockResolvedValue(EMPTY)
})

afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await run(() => root.render(<AppProvider><Probe /></AppProvider>))
}

describe('AppProvider: erros de gravação', () => {
  it('withPersistence relança o erro traduzido, com código e causa, para os diálogos', async () => {
    await mount()
    expect(ctx.state.auth.status).toBe('ready')
    const raw = { code: 'P0001', message: 'plan_limit_projects' }
    repo.saveProject.mockRejectedValue(raw)
    let thrown
    await run(async () => {
      try { await ctx.addProject({ name: 'Obra' }) } catch (e) { thrown = e }
    })
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toBe('Você atingiu o limite de projetos do seu plano.')
    expect(thrown.code).toBe('P0001')
    expect(thrown.cause).toBe(raw)
    expect(ctx.state.save.error).toBe(thrown.message)
  })
})

describe('AppProvider: falha no primeiro carregamento', () => {
  it('mostra o erro traduzido e Tentar de novo recarrega o workspace da sessão atual', async () => {
    repo.ensureWorkspace.mockRejectedValueOnce({ message: 'TypeError: Failed to fetch', code: '' })
    await mount()
    expect(ctx.state.auth).toMatchObject({ status: 'error', error: 'Sem conexão. Verifique a internet e tente de novo.' })
    await run(() => ctx.retryLoad())
    expect(repo.ensureWorkspace).toHaveBeenCalledTimes(2)
    expect(repo.ensureWorkspace).toHaveBeenLastCalledWith({ id: 'u1' })
    expect(ctx.state.auth).toMatchObject({ status: 'ready', user: { id: 'u1' }, workspace: { id: 'w1' }, error: null })
  })

  it('Tentar de novo com falha ao ler a sessão continua no erro, sem cair na página pública', async () => {
    repo.ensureWorkspace.mockRejectedValueOnce({ message: 'TypeError: Failed to fetch', code: '' })
    await mount()
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } })
    await run(() => ctx.retryLoad())
    expect(ctx.state.auth).toMatchObject({ status: 'error', error: 'Sem conexão. Verifique a internet e tente de novo.' })
  })
})
