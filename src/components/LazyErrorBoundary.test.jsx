// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import React, { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import LazyErrorBoundary from './LazyErrorBoundary'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

const settle = () => new Promise((r) => setTimeout(r, 0))
let root, container
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
})

async function mount(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(ui); await settle() })
}

const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

describe('LazyErrorBoundary', () => {
  it('mostra o conteúdo quando o pedaço carrega', async () => {
    const Page = React.lazy(() => Promise.resolve({ default: () => <p>Atas</p> }))
    await mount(<LazyErrorBoundary><Suspense fallback={null}><Page /></Suspense></LazyErrorBoundary>)
    expect(container.textContent).toBe('Atas')
  })

  it('falha ao baixar o pedaço (deploy novo, rede) mostra aviso e Recarregar', async () => {
    // O React registra o erro capturado no console; aqui ele é esperado.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReload = vi.fn()
    const Page = React.lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
    await mount(
      <LazyErrorBoundary onReload={onReload}><Suspense fallback={null}><Page /></Suspense></LazyErrorBoundary>,
    )
    expect(container.querySelector('[role="alert"]').textContent)
      .toContain('Não foi possível carregar esta parte do app. Recarregue a página.')
    act(() => button('Recarregar').click())
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
