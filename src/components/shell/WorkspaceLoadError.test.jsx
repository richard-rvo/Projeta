// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import WorkspaceLoadError from './WorkspaceLoadError'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove() })

function mount(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}

const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

describe('WorkspaceLoadError', () => {
  it('mostra a mensagem e oferece Tentar de novo e Sair', () => {
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    mount(<WorkspaceLoadError message="Sem conexão. Verifique a internet e tente de novo." onRetry={onRetry} onSignOut={onSignOut} />)
    expect(container.querySelector('[role="alert"]').textContent).toContain('Sem conexão. Verifique a internet e tente de novo.')
    act(() => button('Tentar de novo').click())
    expect(onRetry).toHaveBeenCalledTimes(1)
    act(() => button('Sair').click())
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('sem mensagem usa um texto padrão', () => {
    mount(<WorkspaceLoadError message={null} onRetry={() => {}} onSignOut={() => {}} />)
    expect(container.textContent).toContain('Falha ao carregar o workspace.')
  })
})
