// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../../context/AppContext'
import PageMinutes from './PageMinutes'
import { useProjectMinutes } from './useProjectMinutes'

vi.mock('./useProjectMinutes', () => ({ useProjectMinutes: vi.fn() }))
vi.mock('./editor/MinuteEditor', () => ({
  default: ({ onContentError }) => (
    <button type="button" data-testid="editor" onClick={() => onContentError(new Error('x'))} />
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
  minutes: [], query: '', setQuery: vi.fn(), activeMinute: null, openMinute: vi.fn(),
  createMinute: vi.fn().mockResolvedValue(null), updateActiveMinute: vi.fn(),
  removeMinute: vi.fn(), retrySave: vi.fn(), saveStatus: 'idle', loading: false, error: '',
})

async function render(overrides) {
  const hook = { ...base(), ...overrides }
  useProjectMinutes.mockReturnValue(hook)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const ctx = { state: { activeProjectId: 'p1' }, showToast: vi.fn(), openTaskInspector: vi.fn() }
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
})
