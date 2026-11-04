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
