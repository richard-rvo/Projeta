// Itens do menu / e o filtro deles. Sem React: cada item sabe se aplicar
// sobre o editor, a partir do trecho "/consulta" que o disparou.
import {
  CircleCheckBig,
  Gavel,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  TextQuote,
} from 'lucide-react'
import { generateId } from '../../../utils/ids'

// Apaga o "/consulta" e encadeia o comando do bloco.
const block = (apply) => (editor, range) => apply(editor.chain().focus().deleteRange(range)).run()

// Ação e Decisão: o bloco atual vira o nó, com id novo. Se já é esse nó,
// só apaga o "/consulta" (trocar o id desligaria a ação da tarefa).
const turnInto = (type) => (editor, range) => {
  const chain = editor.chain().focus().deleteRange(range)
  return (editor.isActive(type) ? chain : chain.setNode(type, { id: generateId() })).run()
}

export const SLASH_ITEMS = [
  { id: 'paragraph', label: 'Texto', icon: Pilcrow, run: block((c) => c.setParagraph()) },
  { id: 'heading1', label: 'Título 1', icon: Heading1, run: block((c) => c.setHeading({ level: 1 })) },
  { id: 'heading2', label: 'Título 2', icon: Heading2, run: block((c) => c.setHeading({ level: 2 })) },
  { id: 'heading3', label: 'Título 3', icon: Heading3, run: block((c) => c.setHeading({ level: 3 })) },
  { id: 'bulletList', label: 'Lista', icon: List, run: block((c) => c.toggleBulletList()) },
  { id: 'orderedList', label: 'Lista numerada', icon: ListOrdered, run: block((c) => c.toggleOrderedList()) },
  { id: 'taskList', label: 'Checklist', icon: ListChecks, run: block((c) => c.toggleTaskList()) },
  { id: 'blockquote', label: 'Citação', icon: TextQuote, run: block((c) => c.toggleBlockquote()) },
  { id: 'divider', label: 'Divisor', icon: Minus, run: block((c) => c.setHorizontalRule()) },
  { id: 'actionItem', label: 'Ação', icon: CircleCheckBig, run: turnInto('actionItem') },
  { id: 'decision', label: 'Decisão', icon: Gavel, run: turnInto('decision') },
]

const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const FOLDED = SLASH_ITEMS.map((item) => fold(item.label))

// 0: o rótulo começa pela consulta · 1: uma palavra começa · 2: contém.
function rank(label, query) {
  if (label.startsWith(query)) return 0
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 1
  return label.includes(query) ? 2 : -1
}

/** Filtra por rótulo, sem acento e sem diferença de maiúsculas; empate mantém a ordem do menu. */
export function filterSlashItems(query = '') {
  const q = fold(query)
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.map((item, index) => ({ item, index, r: rank(FOLDED[index], q) }))
    .filter((entry) => entry.r >= 0)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((entry) => entry.item)
}
