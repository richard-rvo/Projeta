// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Fragment, Slice } from '@tiptap/pm/model'
import { undoDepth } from '@tiptap/pm/history'
import { ActionItemNode, regenerateActionIds } from './actionItemNode'
import { Decision } from './Decision'
import { syncContent } from './syncContent'
import { MINUTE_TEMPLATES } from '../templates'
import { extractActions, updateActionInDoc } from '../minuteDoc'

// Só o esquema: o mesmo conjunto do MinuteEditor, sem NodeView em React,
// sem Placeholder e sem o menu /.
const editors = []
function makeEditor(content) {
  const editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), ActionItemNode, Decision],
    content,
  })
  editors.push(editor)
  return editor
}
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

const t = (text) => ({ type: 'text', text })
const para = (text) => (text ? { type: 'paragraph', content: [t(text)] } : { type: 'paragraph' })
const action = (id, text, attrs = {}) => ({
  type: 'actionItem',
  attrs: { id, ownerName: '', dueDate: null, status: 'aberta', taskId: null, ...attrs },
  ...(text ? { content: [t(text)] } : {}),
})
const doc = (...content) => ({ type: 'doc', content })

function blocks(json, types = ['actionItem', 'decision']) {
  const out = []
  const walk = (node) => {
    if (types.includes(node.type)) out.push(node)
    node.content?.forEach(walk)
  }
  walk(json)
  return out
}

const ids = (editor) => extractActions(editor.getJSON()).map((a) => a.id)

// Posição logo depois do último caractere do primeiro bloco do tipo pedido.
function endOf(editor, typeName, index = 0) {
  let found = null
  let seen = 0
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === typeName) {
      if (seen === index) found = pos + 1 + node.content.size
      seen += 1
    }
  })
  return found
}

// O jsdom não tem ClipboardEvent; o pasteHTML só repassa o evento ao handlePaste.
const pasteEvent = () => new Event('paste')

function press(editor, key, mods = {}) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }),
  )
}

describe('esquema da ata', () => {
  it.each(MINUTE_TEMPLATES.map((tpl) => [tpl.id, tpl.doc]))(
    'o modelo "%s" volta igual de getJSON()',
    (_id, templateDoc) => {
      const json = makeEditor(templateDoc).getJSON()
      expect(blocks(json)).toEqual(blocks(templateDoc))
    },
  )

  it('preenche os atributos padrão de ação e decisão', () => {
    const json = makeEditor(
      doc(
        { type: 'actionItem', attrs: { id: 'a1' }, content: [t('Comprar flanges')] },
        { type: 'decision', attrs: { id: 'd1' }, content: [t('Aprovado')] },
      ),
    ).getJSON()
    expect(json.content[0]).toEqual({
      type: 'actionItem',
      attrs: { id: 'a1', ownerName: '', dueDate: null, status: 'aberta', taskId: null },
      content: [t('Comprar flanges')],
    })
    expect(json.content[1]).toEqual({
      type: 'decision',
      attrs: { id: 'd1' },
      content: [t('Aprovado')],
    })
  })

  it('ação e decisão sobrevivem ao HTML (o caminho do copiar e colar)', () => {
    const original = doc(
      para('Abertura'),
      action('a1', 'Comprar flanges', {
        ownerName: 'João',
        dueDate: '2026-11-20',
        status: 'concluída',
        taskId: 't1',
      }),
      { type: 'decision', attrs: { id: 'd1' }, content: [t('Aprovado')] },
    )
    const html = makeEditor(original).getHTML()
    const reparsed = makeEditor(html).getJSON()
    expect(blocks(reparsed)).toEqual(blocks(original))
  })
})

describe('colar ação gera id novo (Review Focus 1)', () => {
  // Cola ANTES da original: se só a deduplicação por ordem agisse, a original
  // é que perderia o id. O transformPasted garante que muda sempre a colada.
  it('colar uma ação com id já presente no documento troca o id da colada', () => {
    const editor = makeEditor(doc(para(''), action('x', 'Original')))
    editor.commands.setTextSelection(1)
    editor.view.pasteHTML(
      '<div data-type="action-item" data-id="x" data-owner="Ana" data-due="2026-11-20">Colada</div>',
      pasteEvent(),
    )
    const actions = extractActions(editor.getJSON())
    expect(actions.map((a) => a.description)).toEqual(['Colada', 'Original'])
    expect(actions[1].id).toBe('x')
    expect(actions[0].id).toEqual(expect.any(String))
    expect(actions[0].id).not.toBe('x')
    expect(actions[0]).toMatchObject({ ownerName: 'Ana', dueDate: '2026-11-20' })
  })

  it('colar o próprio documento duplica as ações com ids novos', () => {
    const editor = makeEditor(doc(action('a1', 'Um'), action('a2', 'Dois'), para('')))
    const html = editor.getHTML()
    editor.commands.setTextSelection(endOf(editor, 'paragraph'))
    editor.view.pasteHTML(html, pasteEvent())
    const list = ids(editor)
    expect(list).toHaveLength(4)
    expect(list.slice(0, 2)).toEqual(['a1', 'a2'])
    expect(new Set(list).size).toBe(4)
  })

  // A tarefa pode ser de outro projeto: a FK (task_id, project_id) recusaria
  // a gravação inteira da ata. Na mesma ata, seriam duas ações numa tarefa.
  it.each([
    ['de outra ata (tarefa fora deste documento)', 't-outro'],
    ['da mesma ata (cópia de ação já ligada)', 't1'],
  ])('colar ação %s solta o vínculo com a tarefa', (_caso, taskId) => {
    const editor = makeEditor(doc(para(''), action('a1', 'Original', { taskId: 't1' })))
    editor.commands.setTextSelection(1)
    editor.view.pasteHTML(
      `<div data-type="action-item" data-id="a1" data-task-id="${taskId}">Colada</div>`,
      pasteEvent(),
    )
    const actions = extractActions(editor.getJSON())
    expect(actions.map((a) => [a.description, a.taskId])).toEqual([
      ['Colada', null],
      ['Original', 't1'],
    ])
  })

  // Arrastar (mover) dentro da ata é a mesma ação mudando de lugar: a
  // original sai no mesmo passo, então o vínculo continua.
  it.each([
    [true, 't1'],
    [false, null],
  ])('arrastar com move=%s mantém o vínculo só ao mover', (move, expected) => {
    const editor = makeEditor(doc(para('Antes'), action('a1', 'Ligada', { taskId: 't1' })))
    const from = endOf(editor, 'paragraph') + 1
    const slice = editor.state.doc.slice(from, editor.state.doc.content.size)
    editor.view.dragging = { slice, move }
    let pasted = slice
    editor.view.someProp('transformPasted', (f) => {
      pasted = f(pasted, editor.view, false)
    })
    editor.view.dragging = null
    expect(pasted.content.firstChild.attrs.taskId).toBe(expected)
    expect(pasted.content.firstChild.attrs.id).not.toBe('a1')
  })

  it('regenerateActionIds troca o id também de ação aninhada e mantém o resto', () => {
    const editor = makeEditor(doc(para('')))
    const { schema } = editor
    const nested = schema.nodes.blockquote.create(null, [
      schema.nodes.actionItem.create({ id: 'x', ownerName: 'Ana' }, schema.text('Aninhada')),
    ])
    const slice = new Slice(Fragment.from(nested), 0, 0)
    let n = 0
    const out = regenerateActionIds(slice, () => `novo-${++n}`)
    const inner = out.content.firstChild.firstChild
    expect(inner.attrs).toMatchObject({ id: 'novo-1', ownerName: 'Ana' })
    expect(inner.textContent).toBe('Aninhada')
    expect(out.openStart).toBe(0)
  })
})

describe('ids das ações dentro do editor', () => {
  it('dividir uma ação no meio cria outra ação com id próprio', () => {
    const editor = makeEditor(doc(action('a1', 'Comprar flanges', { taskId: 't1' })))
    editor.commands.setTextSelection(1 + 'Comprar'.length)
    editor.commands.splitBlock()
    const actions = extractActions(editor.getJSON())
    expect(actions.map((a) => a.description)).toEqual(['Comprar', ' flanges'])
    expect(actions[0]).toMatchObject({ id: 'a1', taskId: 't1' })
    expect(actions[1].id).toEqual(expect.any(String))
    expect(actions[1].id).not.toBe('a1')
    expect(actions[1].taskId).toBeNull()
  })

  it('ação de modelo (id nulo) ganha id na primeira edição, fora do histórico', () => {
    const editor = makeEditor(MINUTE_TEMPLATES.find((tpl) => tpl.id === 'kickoff').doc)
    expect(ids(editor)).toEqual([null])
    editor.commands.setTextSelection(endOf(editor, 'actionItem'))
    editor.commands.insertContent('Enviar cronograma')
    const [id] = ids(editor)
    expect(id).toEqual(expect.any(String))
    editor.commands.undo()
    expect(extractActions(editor.getJSON())[0]).toMatchObject({ id, description: '' })
  })
})

describe('teclado', () => {
  it('Enter no fim de uma ação cria outra ação logo abaixo', () => {
    const editor = makeEditor(doc(action('a1', 'Primeira')))
    editor.commands.setTextSelection(endOf(editor, 'actionItem'))
    press(editor, 'Enter')
    editor.commands.insertContent('Segunda')
    const actions = extractActions(editor.getJSON())
    expect(actions.map((a) => a.description)).toEqual(['Primeira', 'Segunda'])
    expect(actions[1].id).toEqual(expect.any(String))
    expect(actions[1].id).not.toBe('a1')
  })

  it('Enter numa ação vazia volta a ser texto', () => {
    const editor = makeEditor(doc(action('a1', 'Primeira'), action('a2', '')))
    editor.commands.setTextSelection(endOf(editor, 'actionItem', 1))
    press(editor, 'Enter')
    expect(ids(editor)).toEqual(['a1'])
    expect(editor.getJSON().content[1]).toEqual(para(''))
  })

  it('Backspace no início de uma ação volta a ser texto, sem perder o conteúdo', () => {
    const editor = makeEditor(doc(para('Antes'), action('a1', 'Ação')))
    editor.commands.setTextSelection(endOf(editor, 'paragraph') + 2)
    press(editor, 'Backspace')
    expect(editor.getJSON().content.slice(0, 2)).toEqual([para('Antes'), para('Ação')])
  })

  it.each([
    ['bulletList', 'listItem'],
    ['taskList', 'taskItem'],
  ])('Tab e Shift+Tab aninham e desaninham itens de %s', (listType, itemType) => {
    const item = (text) => ({
      type: itemType,
      ...(itemType === 'taskItem' ? { attrs: { checked: false } } : {}),
      content: [para(text)],
    })
    const editor = makeEditor(doc({ type: listType, content: [item('Um'), item('Dois')] }))
    editor.commands.setTextSelection(endOf(editor, 'paragraph', 1))
    press(editor, 'Tab')
    const nested = editor.getJSON().content[0]
    expect(nested.content).toHaveLength(1)
    expect(nested.content[0].content[1].type).toBe(listType)
    press(editor, 'Tab', { shiftKey: true })
    expect(editor.getJSON().content[0].content).toHaveLength(2)
  })

  it('Ctrl+Z desfaz a última edição', () => {
    const editor = makeEditor(doc(para('Texto')))
    editor.commands.setTextSelection(endOf(editor, 'paragraph'))
    editor.commands.insertContent(' novo')
    expect(editor.getText()).toBe('Texto novo')
    press(editor, 'z', { ctrlKey: true })
    expect(editor.getText()).toBe('Texto')
  })
})

describe('syncContent: documento alterado fora do editor', () => {
  it('aplica a mudança sem disparar update, sem entrar no histórico e sem mover o cursor', () => {
    const editor = makeEditor(doc(para('Abertura'), action('a1', 'Comprar flanges')))
    const caret = endOf(editor, 'actionItem') - 3
    editor.commands.setTextSelection(caret)
    const depth = undoDepth(editor.state)
    const onUpdate = vi.fn()
    editor.on('update', onUpdate)

    const next = updateActionInDoc(editor.getJSON(), 'a1', { taskId: 't1', status: 'concluída' })
    expect(syncContent(editor, next)).toBe(true)

    expect(extractActions(editor.getJSON())[0]).toMatchObject({ taskId: 't1', status: 'concluída' })
    expect(editor.state.selection.from).toBe(caret)
    expect(undoDepth(editor.state)).toBe(depth)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('substitui por outro documento inteiro', () => {
    const editor = makeEditor(doc(para('Ata A')))
    const other = doc(para('Ata B'), action('b1', 'Outra'))
    expect(syncContent(editor, other)).toBe(true)
    expect(editor.getJSON()).toEqual(other)
  })

  it('não faz nada quando o documento é o mesmo ou inválido', () => {
    const editor = makeEditor(doc(para('Igual')))
    const before = editor.state.doc
    expect(syncContent(editor, doc(para('Igual')))).toBe(false)
    expect(syncContent(editor, { type: 'doc', content: [{ type: 'naoExiste' }] })).toBe(false)
    expect(editor.state.doc).toBe(before)
  })
})
