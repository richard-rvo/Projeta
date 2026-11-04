// Nó `actionItem` só com o esquema: atributos, HTML, teclado e o plugin de ids.
// A NodeView em React entra por cima, em ActionItem.jsx. Os testes usam este.
import { Node, mergeAttributes } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { generateId } from '../../../utils/ids'

export const ACTION_STATUSES = ['aberta', 'concluída', 'cancelada']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Cada atributo viaja no HTML (copiar e colar) como data-*: [nome no HTML,
// padrão, leitura]. `keepOnSplit: false` vale para o bloco novo do splitBlock;
// dividir no meio copia tudo, e quem corrige o id é fillMissingIds.
const ATTRS = {
  id: ['id', null],
  ownerName: ['owner', ''],
  dueDate: ['due', null, (value) => (DATE_RE.test(value || '') ? value : null)],
  status: ['status', 'aberta', (value) => (ACTION_STATUSES.includes(value) ? value : 'aberta')],
  taskId: ['task-id', null],
}

function mapFragment(fragment, fn) {
  const nodes = []
  fragment.forEach((node) => {
    const mapped = fn(node)
    nodes.push(mapped.isLeaf ? mapped : mapped.copy(mapFragment(mapped.content, fn)))
  })
  return Fragment.fromArray(nodes)
}

const NO_TASKS = new Set()

function taskIdsIn(doc) {
  const taskIds = new Set()
  doc.descendants((node) => {
    if (node.type.name === 'actionItem' && node.attrs.taskId) taskIds.add(node.attrs.taskId)
    return !node.isTextblock
  })
  return taskIds
}

/**
 * Toda ação do trecho colado ganha id novo (Review Focus 1) e perde o vínculo
 * com a tarefa, salvo se o `taskId` está em `keepTaskIds`.
 */
export function regenerateActionIds(slice, makeId = generateId, keepTaskIds = NO_TASKS) {
  const content = mapFragment(slice.content, (node) => {
    if (node.type.name !== 'actionItem') return node
    const taskId = keepTaskIds.has(node.attrs.taskId) ? node.attrs.taskId : null
    return node.type.create({ ...node.attrs, id: makeId(), taskId }, node.content, node.marks)
  })
  return new Slice(content, slice.openStart, slice.openEnd)
}

// Colar é sempre uma ação nova, sem tarefa: ela pode ser de outro projeto, e a
// FK (task_id, project_id) recusaria a gravação inteira da ata; na mesma ata,
// seriam duas ações numa tarefa. Só arrastar para mover dentro da ata mantém o
// vínculo, porque a original sai no mesmo passo.
function transformPasted(slice, view) {
  const keep = view.dragging?.move ? taskIdsIn(view.state.doc) : NO_TASKS
  return regenerateActionIds(slice, generateId, keep)
}

// Ação sem id (vinda de modelo) ou com id repetido (dividir uma ação copia os
// atributos) ganha id novo; a cópia repetida também perde o vínculo com a
// tarefa, que continua só na original. Fica fora do histórico: desfazer a
// edição não deve devolver o id nulo.
function fillMissingIds(transactions, _oldState, state) {
  if (!transactions.some((tr) => tr.docChanged)) return null
  const seen = new Set()
  let tr = null
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'actionItem') {
      const { id } = node.attrs
      const repeated = !!id && seen.has(id)
      if (!id || repeated) {
        tr = tr || state.tr
        const fresh = generateId()
        tr.setNodeMarkup(pos, null, { ...node.attrs, id: fresh, ...(repeated ? { taskId: null } : {}) })
        seen.add(fresh)
      } else {
        seen.add(id)
      }
    }
    return !node.isTextblock
  })
  return tr && tr.setMeta('addToHistory', false)
}

export const ActionItemNode = Node.create({
  name: 'actionItem',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return Object.fromEntries(
      Object.entries(ATTRS).map(([key, [html, fallback, parse = (value) => value || fallback]]) => [
        key,
        {
          default: fallback,
          keepOnSplit: false,
          parseHTML: (el) => parse(el.getAttribute(`data-${html}`)),
          renderHTML: (attrs) => (attrs[key] ? { [`data-${html}`]: attrs[key] } : {}),
        },
      ]),
    )
  },

  parseHTML() {
    return [{ tag: 'div[data-type="action-item"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'action-item' }), 0]
  },

  addKeyboardShortcuts() {
    const inAction = () => {
      const { empty, $from } = this.editor.state.selection
      return empty && $from.parent.type === this.type ? $from : null
    }
    return {
      // Enter numa ação vazia volta a ser texto; no fim de uma ação, abre outra
      // logo abaixo (como na checklist). No meio, a divisão padrão.
      Enter: () => {
        const $from = inAction()
        if (!$from) return false
        if ($from.parent.content.size === 0) return this.editor.commands.setNode('paragraph')
        if ($from.parentOffset < $from.parent.content.size) return false
        return this.editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            const pos = $from.after()
            tr.insert(pos, this.type.create({ id: generateId() }))
            tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView()
          }
          return true
        })
      },
      // Backspace no início da ação volta a ser texto, sem juntar com o bloco de cima.
      Backspace: () => {
        const $from = inAction()
        if (!$from || $from.parentOffset !== 0) return false
        return this.editor.commands.setNode('paragraph')
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('actionItemIds'),
        props: { transformPasted },
        appendTransaction: fillMissingIds,
      }),
    ]
  },
})
