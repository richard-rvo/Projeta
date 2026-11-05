// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { reducer, ACTIONS } from './AppContext'

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
