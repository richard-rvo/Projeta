// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppContext } from '../../context/AppContext'
import PageAdmin from './PageAdmin'
import AppRail from '../../components/shell/AppRail'
import * as repo from './adminRepository'

vi.mock('./adminRepository', async (orig) => ({
  ...(await orig()),
  amIPlatformAdmin: vi.fn(), getAdminOverview: vi.fn(), listAdminUsers: vi.fn(), listInvites: vi.fn(), adminAction: vi.fn(),
}))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

const settle = () => new Promise((r) => setTimeout(r, 0))
const run = (fn) => act(async () => { await fn(); await settle() })
const click = (el) => run(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
const setInput = (el, value) => run(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

const OVERVIEW = {
  users_total: 5, users_active: 4, users_invited: 2, users_revoked: 1, invites_pending: 3, invites_expired: 1, invites_accepted: 4,
  invites_revoked: 0, acceptance_rate: 0.44, active_7d: 2, active_30d: 3, projects: 17, tasks: 230, anomalies: 6, minutes: 9, actions_open: 12,
}
const user = (id, extra) => ({
  user_id: id, email: `${id}@x.com`, display_name: id, status: 'active', is_admin: false,
  created_at: '2026-10-01T12:00:00Z', last_sign_in_at: null, invited_at: null, projects: 1, tasks: 2, anomalies: 0, minutes: 0,
  last_activity_at: null, photos_bytes: 5 * 1024 * 1024 + 300000, ...extra,
})
const future = '2099-01-01T00:00:00Z'
const invite = (id, extra) => ({
  id, email: `${id}@x.com`, note: '', status: 'pending', created_at: '2026-11-01T10:00:00Z', expires_at: future,
  sent_count: 1, last_sent_at: '2026-11-01T10:00:00Z', last_error: null, display_status: 'pending', ...extra,
})

let root, container
async function mount(ui, auth = {}) {
  const ctx = {
    state: { auth: { isPlatformAdmin: true, user: { id: 'me' }, ...auth }, anomalies: [], activePage: 'pageAdmin', railPinned: true, theme: 'light' },
    navigate: vi.fn(), setProjectTab: vi.fn(), toggleRailPinned: vi.fn(), setTheme: vi.fn(),
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await run(() => root.render(<AppContext.Provider value={ctx}>{ui}</AppContext.Provider>))
  return ctx
}

beforeEach(() => {
  repo.getAdminOverview.mockResolvedValue(OVERVIEW)
  repo.listAdminUsers.mockResolvedValue([])
  repo.listInvites.mockResolvedValue([])
  repo.adminAction.mockResolvedValue({})
})
afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

describe('visão geral', () => {
  it('mostra os KPIs do RPC e os 5 usuários mais ativos', async () => {
    repo.listAdminUsers.mockResolvedValue([1, 2, 3, 4, 5, 6].map((n) => user(`u${n}`, { last_activity_at: `2026-11-0${n}T15:30:00Z` })))
    await mount(<PageAdmin />)
    const kpis = document.querySelector('section[aria-label="Indicadores"]').textContent
    for (const t of ['Usuários ativos4', 'Aguardando primeiro acesso2', 'Convites pendentes3', 'Taxa de aceitação44%', 'Ativos 7 dias2', 'Ativos 30 dias3', 'Projetos17', 'Tarefas230', 'Atas9', 'Ações abertas12']) {
      expect(kpis).toContain(t)
    }
    const rows = document.querySelectorAll('ol li')
    expect(rows).toHaveLength(5)
    expect(rows[0].textContent).toContain('u6')
  })

  it('não renderiza nada para quem não é admin', async () => {
    await mount(<PageAdmin />, { isPlatformAdmin: false })
    expect(container.innerHTML).toBe('')
    expect(repo.getAdminOverview).not.toHaveBeenCalled()
  })
})

describe('convites', () => {
  const open = async () => { await mount(<PageAdmin />); await click(byText('button', 'Convites')) }

  it('valida e-mail e não chama a ação', async () => {
    await open()
    await setInput(document.querySelector('input[type="email"]'), 'sem-arroba')
    await click(byText('button', 'Enviar convite'))
    expect(repo.adminAction).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]').textContent).toBe('Informe um e-mail válido.')
  })

  it('envia convite, mostra sucesso e recarrega a lista', async () => {
    await open()
    await setInput(document.querySelector('input[type="email"]'), '  Ana@Empresa.com ')
    await click(byText('button', 'Enviar convite'))
    expect(repo.adminAction).toHaveBeenCalledWith('invite', { email: 'ana@empresa.com', note: '' })
    expect(document.querySelector('[role="status"]').textContent).toContain('ana@empresa.com')
    expect(repo.listInvites).toHaveBeenCalledTimes(2)
  })

  it('mostra o erro em português quando o envio falha', async () => {
    repo.adminAction.mockRejectedValue(Object.assign(new Error('Este e-mail já tem acesso.'), { friendly: true }))
    await open()
    await setInput(document.querySelector('input[type="email"]'), 'a@b.com')
    await click(byText('button', 'Enviar convite'))
    expect(document.querySelector('[role="alert"]').textContent).toBe('Este e-mail já tem acesso.')
  })

  it('mostra status derivado e ações só para pendente/expirado; revogar pede confirmação', async () => {
    repo.listInvites.mockResolvedValue([
      invite('p'), invite('e', { display_status: 'expired' }), invite('a', { display_status: 'accepted', status: 'accepted' }),
      invite('r', { display_status: 'revoked', status: 'revoked', last_error: 'falhou' }),
    ])
    await open()
    const labels = [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[1].textContent)
    expect(labels).toEqual(['Pendente', 'Expirado', 'Aceito', 'Revogado'])
    expect(document.querySelectorAll('button[aria-label^="Reenviar"]')).toHaveLength(2)
    expect(document.querySelector('tbody tr').children[2].textContent).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)

    await click(document.querySelector('button[aria-label="Reenviar convite para p@x.com"]'))
    expect(repo.adminAction).toHaveBeenCalledWith('resend', { inviteId: 'p' })

    await click(document.querySelector('button[aria-label="Revogar convite de p@x.com"]'))
    expect(repo.adminAction).not.toHaveBeenCalledWith('revoke_invite', expect.anything())
    await click(byText('[role="dialog"] button', 'Revogar convite'))
    expect(repo.adminAction).toHaveBeenCalledWith('revoke_invite', { inviteId: 'p' })
  })
})

describe('usuários', () => {
  const open = async () => { await mount(<PageAdmin />); await click(byText('button', 'Usuários')) }

  it('desabilita para si e admins; revoga e restaura com confirmação; fotos em MB', async () => {
    repo.listAdminUsers.mockResolvedValue([
      user('me'), user('adm', { is_admin: true }), user('ok'), user('off', { status: 'revoked' }),
    ])
    await open()
    expect(document.querySelector('button[aria-label="Revogar acesso de me@x.com"]').disabled).toBe(true)
    expect(document.querySelector('button[aria-label="Revogar acesso de adm@x.com"]').disabled).toBe(true)
    expect(document.querySelector('tbody tr').textContent).toContain('5,3 MB')

    await click(document.querySelector('button[aria-label="Revogar acesso de ok@x.com"]'))
    expect(repo.adminAction).not.toHaveBeenCalled()
    await click(byText('[role="dialog"] button', 'Revogar acesso'))
    expect(repo.adminAction).toHaveBeenCalledWith('revoke_user', { userId: 'ok' })

    await click(document.querySelector('button[aria-label="Restaurar acesso de off@x.com"]'))
    await click(byText('[role="dialog"] button', 'Restaurar acesso'))
    expect(repo.adminAction).toHaveBeenCalledWith('restore_user', { userId: 'off' })
  })
})

describe('contrato final', () => {
  it('rotula Convidado, oferece Reenviar convite só com convite pendente e Revogar para convidado', async () => {
    repo.listAdminUsers.mockResolvedValue([
      user('inv', { status: 'invited' }), user('inv2', { status: 'invited' }), user('off', { status: 'revoked' }),
    ])
    repo.listInvites.mockResolvedValue([invite('inv')])
    await mount(<PageAdmin />); await click(byText('button', 'Usuários'))
    const rows = [...document.querySelectorAll('tbody tr')]
    expect(rows.map((r) => r.children[2].textContent)).toEqual(['Convidado', 'Convidado', 'Revogado'])
    expect(document.querySelector('button[aria-label="Revogar acesso de inv@x.com"]').disabled).toBe(false)
    expect(document.querySelector('button[aria-label="Reenviar convite para inv@x.com"]')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Reenviar convite para inv2@x.com"]')).toBeNull()
    await click(document.querySelector('button[aria-label="Reenviar convite para inv@x.com"]'))
    expect(repo.adminAction).toHaveBeenCalledWith('resend', { inviteId: 'inv' })
    expect(document.querySelector('table').getAttribute('aria-label')).toBe('Usuários')
  })

  it('mostra a dica quando delivered === false', async () => {
    repo.adminAction.mockResolvedValue({ delivered: false, message: 'Esta pessoa já tem conta; avise por fora.' })
    await mount(<PageAdmin />); await click(byText('button', 'Convites'))
    await setInput(document.querySelector('input[type="email"]'), 'a@b.com')
    await click(byText('button', 'Enviar convite'))
    expect(document.querySelector('[role="status"]').textContent).toBe('Esta pessoa já tem conta; avise por fora.')
  })

  it('KPIs e top 5 degradam de forma independente', async () => {
    repo.listAdminUsers.mockRejectedValue(new Error('x'))
    await mount(<PageAdmin />)
    expect(document.querySelector('section[aria-label="Indicadores"]')).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })
})

describe('AppRail', () => {
  it('mostra Administração só para admin', async () => {
    await mount(<AppRail />)
    expect(document.querySelector('button[title="Administração"], button')).toBeTruthy()
    expect(byText('button span', 'Administração')).toBeTruthy()
    await run(() => root.unmount())
    container.remove()
    await mount(<AppRail />, { isPlatformAdmin: false })
    expect(byText('button span', 'Administração')).toBeFalsy()
  })
})
