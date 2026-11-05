// Aplica no editor um documento que mudou fora dele (o painel de ações gravou
// `taskId`, por exemplo). Troca só o trecho que difere, fora do histórico e
// sem disparar `update`, e devolve o cursor ao lugar quando o trecho o cobria.
import { TextSelection } from '@tiptap/pm/state'
import { skipTrailingNodeMeta } from '@tiptap/extensions'

export function syncContent(editor, json) {
  let next
  try {
    next = editor.schema.nodeFromJSON(json)
    next.check()
  } catch {
    return false
  }
  const { doc, selection } = editor.state
  const start = doc.content.findDiffStart(next.content)
  if (start == null) return false
  let { a: endA, b: endB } = doc.content.findDiffEnd(next.content)
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) {
    endA += overlap
    endB += overlap
  }

  const tr = editor.state.tr.replace(start, endA, next.slice(start, endB))
  if (selection instanceof TextSelection && selection.to >= start && selection.from <= endA) {
    const clamp = (pos) => Math.min(pos, tr.doc.content.size)
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(clamp(selection.anchor)), tr.doc.resolve(clamp(selection.head))),
    )
  }
  tr.setMeta('addToHistory', false).setMeta('preventUpdate', true).setMeta(skipTrailingNodeMeta, true)
  editor.view.dispatch(tr)
  return true
}
