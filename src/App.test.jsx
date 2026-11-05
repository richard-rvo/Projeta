// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppContext } from './context/AppContext'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove() })
function mountApp(state) {
  const value = { state, undo: () => {}, redo: () => {}, signIn: () => {}, requestPasswordReset: () => {}, updatePassword: () => {}, retryLoad: () => {}, signOut: () => {} }
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<AppContext.Provider value={value}><App /></AppContext.Provider>))
}
const signedOut = { status: 'ready', user: null, workspace: null, error: null, recovery: false, mustSetPassword: false, errorCode: null }

describe('App: aviso do link de acesso', () => {
  it('com aviso, abre no login e mostra a mensagem', () => {
    const msg = 'O link do convite expirou. Peça um novo convite ao administrador ou use "Esqueci minha senha".'
    mountApp({ auth: signedOut, authNotice: msg })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(msg)
  })
  it('sem aviso, abre na página pública', () => {
    mountApp({ auth: signedOut, authNotice: null })
    expect(container.querySelector('form')).toBeNull()
  })
})
