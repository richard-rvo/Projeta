// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import MinutePrintSheet from './MinutePrintSheet'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove() })

const doc = { type: 'doc', content: [
  { type: 'actionItem', attrs: { id: 'a1', status: 'aberta' }, content: [{ type: 'text', text: 'Enviar laudo' }] },
  { type: 'actionItem', attrs: { id: 'a2', status: 'aberta' } },
  { type: 'decision', content: [{ type: 'text', text: 'Aprovado' }] },
] }

describe('print.css x marcação real do editor', () => {
  it('os seletores de ação/decisão de .minute-print existem no DOM renderizado', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const minute = { id: 'm', title: 'T', meetingAt: '2026-11-04T09:00', content: doc }
    await act(async () => {
      root.render(<MinutePrintSheet minute={minute} projectName="P" />)
      await new Promise((r) => setTimeout(r, 50))
    })
    const css = readFileSync('src/styles/print.css', 'utf8')
    const block = css.slice(css.indexOf('/* Ata de reunião'))
    const used = [...block.matchAll(/\.minute-print\s+((?:\.[\w-]+|\[[^\]]+\])+)/g)].map((m) => m[1])
    const mustExist = used.filter((s) => /minute-action$|minute-decision$|action-item|data-type='decision'/.test(s))
    expect(mustExist.length).toBeGreaterThanOrEqual(3)
    for (const sel of mustExist) expect(container.querySelector(sel), sel).not.toBeNull()
    // Em leitura o editor não renderiza o placeholder da ação vazia; a regra de impressão é só cinto e suspensório.
    expect(container.querySelector('.minute-action__placeholder')).toBeNull()
    expect(container.querySelectorAll('.minute-action').length).toBe(2)
  })
})
