// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MinuteEditor from './MinuteEditor'
import { extractActions, updateActionInDoc } from '../minuteDoc'

// O jsdom não mede layout nem rola. O ProseMirror pede retângulos ao rolar até
// a seleção, o menu / ao se posicionar, e o cmdk observa a altura da lista e
// rola o item ativo; retângulo vazio e stubs inertes bastam.
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
  Range.prototype.getClientRects = () => []
  document.elementFromPoint = () => null
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Deixa microtarefas e timers do editor (portais, menu /) assentarem dentro do act.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const run = (fn) =>
  act(async () => {
    fn()
    await settle()
  })

let root = null
let container = null
afterEach(async () => {
  await run(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await run(() => root.render(<MinuteEditor {...props} />))
  return {
    editor: container.querySelector('.ProseMirror').editor,
    rerender: (next) => run(() => root.render(<MinuteEditor {...next} />)),
  }
}

const t = (text) => ({ type: 'text', text })
const para = (text) => ({ type: 'paragraph', content: [t(text)] })
const action = (id, text, attrs = {}) => ({
  type: 'actionItem',
  attrs: { id, ownerName: '', dueDate: null, status: 'aberta', taskId: null, ...attrs },
  content: [t(text)],
})
const doc = (...content) => ({ type: 'doc', content })

const byText = (text) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('MinuteEditor', () => {
  it('onChange só dispara quando o documento muda', async () => {
    const onChange = vi.fn()
    const content = doc(para('Pauta'))
    const { editor, rerender } = await render({ content, onChange })

    await run(() => editor.commands.setTextSelection(3))
    await rerender({ content, onChange, editable: false })
    await rerender({ content, onChange, editable: true })
    expect(onChange).not.toHaveBeenCalled()

    await run(() => editor.commands.insertContent('!'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(doc(para('Pa!uta')))
  })

  it('reflete um documento alterado fora do editor e ignora o eco do próprio onChange', async () => {
    let current = doc(para('Pauta'), action('a1', 'Comprar flanges'))
    const onChange = vi.fn((next) => {
      current = next
    })
    const { editor, rerender } = await render({ content: current, onChange })

    await run(() => editor.commands.insertContentAt(1, 'A '))
    const echoed = current
    await rerender({ content: echoed, onChange })
    expect(editor.getJSON()).toEqual(echoed)
    expect(byText('Criar tarefa')).toBeTruthy()

    const linked = updateActionInDoc(echoed, 'a1', { taskId: 't1' })
    await rerender({ content: linked, onChange })
    expect(extractActions(editor.getJSON())[0].taskId).toBe('t1')
    expect(byText('Ver tarefa')).toBeTruthy()
    expect(byText('Criar tarefa')).toBeUndefined()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('Criar tarefa e Ver tarefa chamam os callbacks com os ids', async () => {
    const onCreateTask = vi.fn()
    const onOpenTask = vi.fn()
    await render({
      content: doc(action('a1', 'Comprar'), action('a2', 'Liberar', { taskId: 't9' })),
      onCreateTask,
      onOpenTask,
    })
    await run(() => byText('Criar tarefa').click())
    await run(() => byText('Ver tarefa').click())
    expect(onCreateTask).toHaveBeenCalledWith('a1')
    expect(onOpenTask).toHaveBeenCalledWith('t9')
  })

  it('responsável e prazo editam os atributos da ação', async () => {
    const onChange = vi.fn()
    await render({ content: doc(action('a1', 'Comprar')), onChange })
    await run(() => typeInto(container.querySelector('input[aria-label="Responsável"]'), 'Ana'))
    await run(() => typeInto(container.querySelector('input[aria-label="Prazo"]'), '2026-11-20'))
    const [last] = extractActions(onChange.mock.lastCall[0])
    expect(last).toMatchObject({ id: 'a1', ownerName: 'Ana', dueDate: '2026-11-20' })
  })

  it('prazo vencido de ação aberta fica marcado como atrasado', async () => {
    await render({
      content: doc(
        action('a1', 'Vencida', { dueDate: '2000-01-01' }),
        action('a2', 'Concluída', { dueDate: '2000-01-01', status: 'concluída' }),
        action('a3', 'Futura', { dueDate: '2999-01-01' }),
      ),
    })
    const late = [...container.querySelectorAll('input[aria-label="Prazo"]')].map(
      (input) => input.dataset.late === 'true',
    )
    expect(late).toEqual([true, false, false])
  })

  it('/aç filtra para Ação e Enter insere o bloco com id', async () => {
    const { editor } = await render({ content: doc({ type: 'paragraph' }) })
    await run(() => editor.chain().focus().insertContent('/aç').run())

    const items = [...document.querySelectorAll('[cmdk-item]')].map((el) => el.textContent.trim())
    expect(items[0]).toBe('Ação')

    await run(() =>
      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      ),
    )
    const json = editor.getJSON()
    expect(json.content[0].type).toBe('actionItem')
    expect(json.content[0].attrs.id).toEqual(expect.any(String))
    expect(editor.getText()).not.toContain('/')
    expect(document.querySelector('[cmdk-item]')).toBeNull()
  })

  // Um bloco desconhecido (aba velha depois de um deploy, por exemplo) faria o
  // TipTap carregar um doc vazio, e o autosave gravaria esse vazio por cima.
  it('conteúdo inválido trava a edição, avisa e nunca emite onChange', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onChange = vi.fn()
    const onContentError = vi.fn()
    const { editor } = await render({
      content: doc(para('Pauta'), { type: 'naoExiste' }),
      onChange,
      onContentError,
    })
    // O useEditor reaplica `editable` das opções 1 ms depois de montar: espera
    // passar disso para provar que a trava não é desfeita.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    await run(() => editor.commands.insertContent('apagando tudo'))

    expect(onChange).not.toHaveBeenCalled()
    expect(onContentError).toHaveBeenCalledTimes(1)
    expect(onContentError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(editor.isEditable).toBe(false)
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      'Esta ata contém um bloco que esta versão do Projeta não reconhece. Recarregue a página para editar.',
    )
    // O aviso do TipTap ao cair no doc vazio de reserva: esperado, silenciado aqui.
    expect(warn.mock.calls.map((args) => args[0])).toEqual(['[tiptap warn]: Invalid content.'])
    warn.mockRestore()
  })

  it('em modo leitura não há controles de edição', async () => {
    await render({
      content: doc(action('a1', 'Comprar', { ownerName: 'Ana', dueDate: '2026-11-20' })),
      editable: false,
    })
    expect(container.querySelector('input')).toBeNull()
    expect(byText('Criar tarefa')).toBeUndefined()
    expect(container.textContent).toContain('Ana')
    expect(container.querySelector('.ProseMirror').getAttribute('contenteditable')).toBe('false')
  })
})
