// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { reducer, ACTIONS, isInviteHash, authHashNotice, readBootAuthNotice } from './AppContext'

describe('reducer: abrir ata a partir da Visão Geral', () => {
  it('OPEN_MINUTE guarda a ata e troca para a aba Atas; CLEAR limpa', () => {
    const s0 = { activeProjectTab: 'overview', focusMinuteId: null }
    const s1 = reducer(s0, { type: ACTIONS.OPEN_MINUTE, payload: 'm1' })
    expect(s1).toMatchObject({ activeProjectTab: 'minutes', focusMinuteId: 'm1' })
    expect(reducer(s1, { type: ACTIONS.CLEAR_FOCUS_MINUTE }).focusMinuteId).toBeNull()
  })
})

describe('reducer: falha ao carregar o workspace', () => {
  const loaded = {
    auth: { status: 'ready', user: { id: 'u1' }, workspace: { id: 'w1' }, error: null, recovery: false },
    projects: [{ id: 'p1' }], tasks: [{ id: 't1' }], anomalies: [],
  }
  it('AUTH_ERROR guarda a mensagem traduzida e esvazia os dados', () => {
    const s = reducer(loaded, { type: ACTIONS.AUTH_ERROR, payload: 'Sem conexão. Verifique a internet e tente de novo.' })
    expect(s.auth).toMatchObject({ status: 'error', user: null, error: 'Sem conexão. Verifique a internet e tente de novo.' })
    expect(s.projects).toEqual([])
  })
  it('AUTH_RETRY volta para carregando e limpa o erro', () => {
    const failed = reducer(loaded, { type: ACTIONS.AUTH_ERROR, payload: 'x' })
    const s = reducer(failed, { type: ACTIONS.AUTH_RETRY })
    expect(s.auth).toMatchObject({ status: 'loading', error: null })
  })
})

describe('reducer: convite e acesso revogado', () => {
  const base = { auth: { status: 'ready', user: { id: 'u1' }, workspace: null, error: null, recovery: false, mustSetPassword: true, errorCode: null }, projects: [], tasks: [], anomalies: [] }
  it('AUTH_READY preserva mustSetPassword', () => {
    const s = reducer(base, { type: ACTIONS.AUTH_READY, payload: { user: { id: 'u1' }, workspace: { id: 'w' }, data: { projects: [], tasks: [], anomalies: [] } } })
    expect(s.auth.mustSetPassword).toBe(true)
  })
  it('AUTH_SET_MUST_SET_PASSWORD limpa o flag', () => {
    expect(reducer(base, { type: ACTIONS.AUTH_SET_MUST_SET_PASSWORD, payload: false }).auth.mustSetPassword).toBe(false)
  })
  it('AUTH_ERROR guarda o código access_revoked', () => {
    const s = reducer(base, { type: ACTIONS.AUTH_ERROR, payload: 'x', code: 'access_revoked' })
    expect(s.auth).toMatchObject({ status: 'error', errorCode: 'access_revoked' })
  })
  it('AUTH_ERROR mantém mustSetPassword, exceto em access_revoked', () => {
    expect(reducer(base, { type: ACTIONS.AUTH_ERROR, payload: 'x' }).auth.mustSetPassword).toBe(true)
    expect(reducer(base, { type: ACTIONS.AUTH_ERROR, payload: 'x', code: 'access_revoked' }).auth.mustSetPassword).toBe(false)
  })
  it('isInviteHash reconhece type=invite', () => {
    expect(isInviteHash('#access_token=a&type=invite')).toBe(true)
    expect(isInviteHash('#type=recovery')).toBe(false)
    expect(isInviteHash('')).toBe(false)
  })
})

describe('erros do link de acesso no hash', () => {
  const EXPIRED = 'O link do convite expirou. Peça um novo convite ao administrador ou use "Esqueci minha senha".'
  const REVOKED = 'Seu acesso ao Projeta foi revogado. Fale com o administrador.'
  it('authHashNotice traduz otp_expired e user_banned', () => {
    expect(authHashNotice('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe(EXPIRED)
    expect(authHashNotice('#error_code=otp_expired')).toBe(EXPIRED)
    expect(authHashNotice('#error=unauthorized_client&error_code=user_banned')).toBe(REVOKED)
  })
  it('authHashNotice ignora hash sem erro conhecido', () => {
    expect(authHashNotice('#access_token=a&type=invite')).toBeNull()
    expect(authHashNotice('#error=access_denied')).toBeNull()
    expect(authHashNotice('')).toBeNull()
  })
  it('readBootAuthNotice lê o hash e o limpa da URL com replaceState', () => {
    window.history.replaceState(null, '', '/app?x=1#error=access_denied&error_code=otp_expired')
    expect(readBootAuthNotice(window)).toBe(EXPIRED)
    expect(window.location.hash).toBe('')
    expect(window.location.pathname + window.location.search).toBe('/app?x=1')
  })
  it('readBootAuthNotice não mexe na URL quando não há erro', () => {
    window.history.replaceState(null, '', '/#access_token=a&type=invite')
    expect(readBootAuthNotice(window)).toBeNull()
    expect(window.location.hash).toBe('#access_token=a&type=invite')
    window.history.replaceState(null, '', '/')
  })
  it('o aviso sobrevive a AUTH_SIGNED_OUT e some em AUTH_READY', () => {
    const base = { auth: { status: 'loading', user: null }, authNotice: EXPIRED, projects: [], tasks: [], anomalies: [] }
    expect(reducer(base, { type: ACTIONS.AUTH_SIGNED_OUT }).authNotice).toBe(EXPIRED)
    const ready = reducer(base, { type: ACTIONS.AUTH_READY, payload: { user: { id: 'u' }, workspace: { id: 'w' }, data: { projects: [], tasks: [], anomalies: [] } } })
    expect(ready.authNotice).toBeNull()
  })
})
