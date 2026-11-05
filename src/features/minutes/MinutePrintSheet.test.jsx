// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MinutePrintSheet, { MinutePrintPreview } from './MinutePrintSheet'
import { formatDateLong } from '../../utils/schedule'
import { extractActions } from './minuteDoc'
import { ACTION_STATUSES } from './editor/actionItemNode'

const editorProps = vi.fn()
vi.mock('./editor/MinuteEditor', () => ({
  default: (props) => { editorProps(props); return <div data-testid="editor" /> },
}))

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove(); editorProps.mockClear() })

const action = (id, text, attrs) => ({ type: 'actionItem', attrs: { id, ...attrs }, content: [{ type: 'text', text }] })
const minute = (content) => ({
  id: 'm1', title: 'Reunião de status', meetingAt: '2026-11-04T09:00', location: 'Canteiro',
  participants: 'Ana, Bruno', content,
})
const doc = { type: 'doc', content: [
  action('a1', 'Enviar laudo', { ownerName: 'Ana', dueDate: '2026-11-10', status: 'aberta' }),
  action('a2', 'Fechar contrato', { ownerName: 'Bruno', status: 'concluída' }),
] }

function mount(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}

describe('MinutePrintSheet', () => {
  it('mostra o cabeçalho com título, data por extenso, local e participantes', () => {
    mount(<MinutePrintSheet minute={minute(doc)} projectName="Obra X" />)
    const t = container.textContent
    expect(t).toContain('Reunião de status')
    expect(t).toContain('Obra X')
    expect(t).toContain(formatDateLong('2026-11-04'))
    expect(t).toContain('Canteiro')
    expect(t).toContain('Ana, Bruno')
    expect(t).toMatch(/Projeta · Obra X · gerado em /)
  })

  it('monta o editor somente leitura', () => {
    mount(<MinutePrintSheet minute={minute(doc)} projectName="Obra X" />)
    expect(editorProps).toHaveBeenCalledWith(expect.objectContaining({ editable: false, content: doc }))
  })

  it('a tabela de ações espelha extractActions', () => {
    mount(<MinutePrintSheet minute={minute(doc)} projectName="Obra X" />)
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => [...r.cells].map((c) => c.textContent))
    expect(rows).toEqual(extractActions(doc).map((a) => [
      a.description, a.ownerName, a.dueDate ? formatDateLong(a.dueDate) : '—',
      a.status === 'aberta' ? 'Aberta' : 'Concluída',
    ]))
    expect([...container.querySelectorAll('th')].map((h) => h.textContent))
      .toEqual(['Descrição', 'Responsável', 'Prazo', 'Status'])
  })

  it('todo status de ação tem rótulo em português (inclusive cancelada)', () => {
    const all = { type: 'doc', content: ACTION_STATUSES.map((status, i) => action(`s${i}`, status, { status })) }
    mount(<MinutePrintSheet minute={minute(all)} projectName="Obra X" />)
    const cells = [...container.querySelectorAll('tbody tr')].map((r) => r.cells[3].textContent)
    expect(cells).toEqual(['Aberta', 'Concluída', 'Cancelada'])
  })

  it('sem ações mostra a mensagem vazia', () => {
    mount(<MinutePrintSheet minute={minute({ type: 'doc', content: [{ type: 'paragraph' }] })} projectName="Obra X" />)
    expect(container.textContent).toContain('Nenhuma ação registrada.')
    expect(container.querySelector('table')).toBeNull()
  })
})

describe('MinutePrintPreview', () => {
  it('Imprimir / PDF chama window.print e Voltar chama onBack', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const onBack = vi.fn()
    mount(<MinutePrintPreview minute={minute(doc)} projectName="Obra X" onBack={onBack} />)
    const btn = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
    act(() => btn('Imprimir / PDF').click())
    expect(print).toHaveBeenCalledTimes(1)
    act(() => btn('Voltar à edição').click())
    expect(onBack).toHaveBeenCalled()
    print.mockRestore()
  })
})
