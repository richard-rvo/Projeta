import { describe, it, expect } from 'vitest'
import { formatMeetingAt, groupMinutesByMonth } from './groupMinutes'

describe('groupMinutesByMonth', () => {
  it('agrupa por mês, mais recente primeiro, e põe sem data no fim', () => {
    const groups = groupMinutesByMonth([
      { id: 'a', meetingAt: '2026-10-03T09:00' },
      { id: 'b', meetingAt: '' },
      { id: 'c', meetingAt: '2026-11-02T10:00' },
      { id: 'd', meetingAt: '2026-11-04T08:30' },
    ])
    expect(groups.map((g) => g.label)).toEqual(['Novembro de 2026', 'Outubro de 2026', 'Sem data'])
    expect(groups[0].items.map((m) => m.id)).toEqual(['d', 'c'])
    expect(groups[2].items.map((m) => m.id)).toEqual(['b'])
  })

  it('lista vazia não gera grupos', () => {
    expect(groupMinutesByMonth([])).toEqual([])
  })
})

describe('formatMeetingAt', () => {
  it('formata dd/mm hh:mm', () => {
    expect(formatMeetingAt('2026-11-04T14:05')).toBe('04/11 14:05')
    expect(formatMeetingAt('')).toBe('')
  })
})
