import { describe, it, expect } from 'vitest'
import {
  EMPTY_DOC,
  extractActions,
  extractPlainText,
  updateActionInDoc,
  dedupeActionIds,
  isActionOverdue,
} from './minuteDoc'
import { MINUTE_TEMPLATES } from './templates'

const t = (text) => ({ type: 'text', text })
const action = (id, text, attrs = {}) => ({
  type: 'actionItem',
  attrs: { id, ownerName: '', dueDate: null, status: 'aberta', taskId: null, ...attrs },
  content: [t(text)],
})
const para = (text) => ({ type: 'paragraph', content: [t(text)] })

const sample = () => ({
  type: 'doc',
  content: [
    para('Abertura'),
    action('a1', 'Comprar flanges', { ownerName: 'João', dueDate: '2026-11-20' }),
    action('a2', 'Liberar PT'),
  ],
})

describe('minuteDoc', () => {
  it('EMPTY_DOC é um doc com um parágrafo', () => {
    expect(EMPTY_DOC.type).toBe('doc')
  })

  it('extractActions lê ações na ordem com descrição em texto puro', () => {
    const list = extractActions(sample())
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: 'a1',
      description: 'Comprar flanges',
      ownerName: 'João',
      dueDate: '2026-11-20',
      status: 'aberta',
      position: 1,
    })
    expect(list[1].position).toBe(2)
  })

  it('extractActions acha ação dentro de lista', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [action('x', 'Dentro')] }],
        },
      ],
    }
    expect(extractActions(doc).map((a) => a.id)).toEqual(['x'])
  })

  it('extractActions aplica padrões para atributos ausentes', () => {
    const doc = { type: 'doc', content: [{ type: 'actionItem', attrs: { id: 'z' }, content: [t('Algo')] }] }
    expect(extractActions(doc)[0]).toMatchObject({
      status: 'aberta', ownerName: '', dueDate: null, taskId: null,
    })
  })

  it('extractPlainText separa blocos e corta no limite', () => {
    const doc = sample()
    expect(extractPlainText(doc)).toBe('Abertura\nComprar flanges\nLiberar PT')
    expect(extractPlainText(doc, 10).length).toBe(10)
  })

  it('extractPlainText trata hardBreak como quebra de linha', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [t('a'), { type: 'hardBreak' }, t('b')] }] }
    expect(extractPlainText(doc)).toBe('a\nb')
  })

  it('updateActionInDoc não muta o original', () => {
    const doc = sample()
    const next = updateActionInDoc(doc, 'a1', { status: 'concluída' })
    expect(doc.content[1].attrs.status).toBe('aberta')
    expect(next.content[1].attrs.status).toBe('concluída')
    expect(next.content[1].content[0].text).toBe('Comprar flanges')
  })

  it('updateActionInDoc com id desconhecido devolve doc igual e novo', () => {
    const doc = sample()
    const next = updateActionInDoc(doc, 'nope', { status: 'concluída' })
    expect(next).toEqual(doc)
    expect(next).not.toBe(doc)
  })

  it('dedupeActionIds mantém o primeiro e renova os repetidos', () => {
    const doc = { type: 'doc', content: [action('a', 'um'), action('a', 'dois')] }
    const next = dedupeActionIds(doc, () => 'b')
    expect(extractActions(next).map((a) => a.id)).toEqual(['a', 'b'])
    expect(doc.content[1].attrs.id).toBe('a')
  })

  it('dedupeActionIds preenche ids ausentes', () => {
    const doc = { type: 'doc', content: [action(null, 'um')] }
    expect(extractActions(dedupeActionIds(doc, () => 'novo'))[0].id).toBe('novo')
  })

  it('isActionOverdue', () => {
    expect(isActionOverdue({ status: 'aberta', dueDate: '2026-11-01' }, '2026-11-04')).toBe(true)
    expect(isActionOverdue({ status: 'concluída', dueDate: '2026-11-01' }, '2026-11-04')).toBe(false)
    expect(isActionOverdue({ status: 'aberta', dueDate: null }, '2026-11-04')).toBe(false)
  })
})

describe('templates', () => {
  it('todo modelo é um doc válido', () => {
    expect(MINUTE_TEMPLATES.map((m) => m.id)).toEqual(['status', 'kickoff', 'daily', 'blank'])
    for (const m of MINUTE_TEMPLATES) {
      expect(m.doc.type).toBe('doc')
      expect(() => extractActions(m.doc)).not.toThrow()
    }
  })
})
