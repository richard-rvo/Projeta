// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import AuthPage from './AuthPage'
import AccessRevoked from '../components/shell/AccessRevoked'
import PublicLanding from './PublicLanding'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove() })
function mount(ui) {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container); act(() => root.render(ui))
}
const setValue = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('AuthPage por convite', () => {
  it('login não oferece criar conta', () => {
    mount(<AuthPage mode="login" onModeChange={() => {}} onBack={() => {}} signIn={() => {}} />)
    expect(container.textContent).not.toMatch(/Criar conta|Crie sua conta/)
    expect(container.textContent).toContain('O acesso ao Projeta é feito por convite.')
  })
  it('landing sem cadastro', () => {
    mount(<PublicLanding onStart={() => {}} />)
    expect(container.textContent).not.toMatch(/Criar conta|Começar agora/)
    expect(container.textContent).toContain('O acesso ao Projeta é feito por convite.')
  })
  it('login mostra o aviso vindo do link (notice) como alerta', () => {
    const msg = 'O link do convite expirou. Peça um novo convite ao administrador ou use "Esqueci minha senha".'
    mount(<AuthPage mode="login" notice={msg} onModeChange={() => {}} onBack={() => {}} signIn={() => {}} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(msg)
  })
  it('tela de definir senha valida e chama updatePassword', async () => {
    const updatePassword = vi.fn().mockResolvedValue({ error: null })
    mount(<AuthPage mode="invite" updatePassword={updatePassword} />)
    expect(container.textContent).toContain('Bem-vindo ao Projeta — defina sua senha')
    const [pw, confirm] = container.querySelectorAll('input')
    const form = container.querySelector('form')
    setValue(pw, 'curta'); setValue(confirm, 'curta')
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(updatePassword).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
    setValue(pw, 'senhaforte123'); setValue(confirm, 'senhaforte123')
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(updatePassword).toHaveBeenCalledWith('senhaforte123')
  })
})

describe('AccessRevoked', () => {
  it('mostra a mensagem e só oferece Sair', () => {
    const onSignOut = vi.fn()
    mount(<AccessRevoked message="Seu acesso ao Projeta foi revogado. Fale com o administrador." onSignOut={onSignOut} />)
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Sair'])
    expect(container.textContent).toContain('foi revogado')
    act(() => buttons[0].click())
    expect(onSignOut).toHaveBeenCalled()
  })
})
