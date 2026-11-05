import { describe, it, expect } from 'vitest'
import {
  minuteFromRow,
  minuteToRpcArgs,
  actionFromRow,
  defaultMinuteTitle,
  hourStartMeetingAt,
  newMinute,
} from './minutesRepository'
import { EMPTY_DOC } from './minuteDoc'
import { MINUTE_TEMPLATES } from './templates'

const t = (text) => ({ type: 'text', text })
const action = (id, text) => ({
  type: 'actionItem',
  attrs: { id, ownerName: 'João', dueDate: '2026-11-20', status: 'aberta', taskId: null },
  content: [t(text)],
})
const minute = (content) => ({
  id: 'm1', projectId: 'p1', title: 'T', meetingAt: '2026-11-04T14:00', location: 'Sala',
  participants: 'A, B', template: 'blank', content,
})

describe('minutesRepository', () => {
  it('minuteToRpcArgs extrai ações e texto', () => {
    const doc = { type: 'doc', content: [action('a1', 'Comprar flanges'), action('a2', 'Liberar PT')] }
    const { p_minute, p_actions } = minuteToRpcArgs(minute(doc), 'w1')
    expect(p_actions).toHaveLength(2)
    expect(p_minute.content_text).toContain('Comprar flanges')
    expect(p_minute.workspace_id).toBe('w1')
    expect(p_minute.project_id).toBe('p1')
    expect(p_minute.meeting_at).toBe('2026-11-04T14:00')
    expect(p_actions[0]).toEqual({
      id: 'a1', description: 'Comprar flanges', owner_name: 'João',
      due_date: '2026-11-20', status: 'aberta', task_id: null,
    })
  })

  it('minuteToRpcArgs renova ids duplicados', () => {
    const doc = { type: 'doc', content: [action('x', 'um'), action('x', 'dois')] }
    const { p_actions, p_minute } = minuteToRpcArgs(minute(doc), 'w1')
    expect(p_actions[0].id).not.toBe(p_actions[1].id)
    expect(p_minute.content.content[1].attrs.id).toBe(p_actions[1].id)
  })

  it('minuteToRpcArgs corta título, local e participantes nos limites do banco', () => {
    const m = {
      ...minute(EMPTY_DOC),
      title: 't'.repeat(250), location: 'l'.repeat(201), participants: 'p'.repeat(2500),
    }
    const { p_minute } = minuteToRpcArgs(m, 'w1')
    expect(p_minute.title).toBe('t'.repeat(200))
    expect(p_minute.location).toBe('l'.repeat(200))
    expect(p_minute.participants).toBe('p'.repeat(2000))
  })

  it('minuteToRpcArgs mantém textos dentro do limite', () => {
    const { p_minute } = minuteToRpcArgs(minute(EMPTY_DOC), 'w1')
    expect(p_minute).toMatchObject({ title: 'T', location: 'Sala', participants: 'A, B' })
  })

  it('minuteToRpcArgs envia meeting_at null quando vazio', () => {
    const m = { ...minute(EMPTY_DOC), meetingAt: '' }
    expect(minuteToRpcArgs(m, 'w1').p_minute.meeting_at).toBeNull()
  })

  it('minuteFromRow mapeia snake_case para camelCase', () => {
    const m = minuteFromRow({
      id: 'm1', project_id: 'p1', title: 'T', meeting_at: '2026-11-04T14:00', location: 'L',
      participants: 'P', template: 'status', content: EMPTY_DOC,
      created_at: 'c', updated_at: 'u',
    })
    expect(m).toMatchObject({
      id: 'm1', projectId: 'p1', meetingAt: '2026-11-04T14:00', template: 'status',
      createdAt: 'c', updatedAt: 'u',
    })
  })

  it('minuteFromRow aplica defaults', () => {
    const m = minuteFromRow({ id: 'm', project_id: 'p', content: null })
    expect(m).toMatchObject({ title: '', meetingAt: '', location: '', participants: '', template: 'blank' })
    expect(m.content).toEqual(EMPTY_DOC)
    expect(m.content).not.toBe(EMPTY_DOC)
  })

  it('actionFromRow mapeia para camelCase', () => {
    expect(actionFromRow({
      id: 'a', minute_id: 'm', project_id: 'p', description: 'd', owner_name: 'o',
      due_date: '2026-11-20', status: 'aberta', task_id: 't', position: 2,
    })).toEqual({
      id: 'a', minuteId: 'm', projectId: 'p', description: 'd', ownerName: 'o',
      dueDate: '2026-11-20', status: 'aberta', taskId: 't', position: 2,
    })
  })

  it('helpers de criação usam a data local', () => {
    const d = new Date(2026, 10, 4, 14, 37)
    expect(defaultMinuteTitle(d)).toBe('Reunião de 04/11')
    expect(hourStartMeetingAt(d)).toBe('2026-11-04T14:00')
  })
})

describe('newMinute', () => {
  it('cria ata com ids novos sem mutar o template', () => {
    const d = new Date(2026, 10, 4, 14, 37)
    const a = newMinute('p1', 'status', d)
    const b = newMinute('p1', 'status', d)
    expect(a).toMatchObject({ projectId: 'p1', title: 'Reunião de 04/11', meetingAt: '2026-11-04T14:00', template: 'status' })
    expect(a.id).not.toBe(b.id)
    const tpl = MINUTE_TEMPLATES.find((x) => x.id === 'status')
    const tplIds = JSON.stringify(tpl.doc).match(/"id":null/g) || []
    expect(tplIds.length).toBeGreaterThan(0)
    expect(JSON.stringify(a.content)).not.toContain('"id":null')
  })
})
