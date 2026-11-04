// Funções puras sobre o documento da ata (JSON ProseMirror). Sem React/Supabase.

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

// Percurso único, em ordem de documento (pré-ordem). visit(node, parent).
function walk(node, visit, parent = null) {
  if (!node) return
  visit(node, parent)
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, visit, node)
  }
}

const clone = (doc) => structuredClone(doc)

const inlineText = (node) =>
  (node.content || [])
    .map((c) => (c.type === 'text' ? c.text || '' : c.type === 'hardBreak' ? '\n' : ''))
    .join('')

export function extractActions(doc) {
  const actions = []
  walk(doc, (node) => {
    if (node.type !== 'actionItem') return
    const a = node.attrs || {}
    actions.push({
      id: a.id ?? null,
      description: inlineText(node),
      ownerName: a.ownerName || '',
      dueDate: a.dueDate || null,
      status: a.status || 'aberta',
      taskId: a.taskId || null,
      position: actions.length + 1,
    })
  })
  return actions
}

export function extractPlainText(doc, maxLength = 20000) {
  const lines = []
  walk(doc, (node) => {
    if (Array.isArray(node.content) && node.content.some((c) => c.type === 'text')) {
      lines.push(inlineText(node))
    }
  })
  return lines.join('\n').slice(0, maxLength)
}

export function updateActionInDoc(doc, actionId, patch) {
  const next = clone(doc)
  walk(next, (node) => {
    if (node.type === 'actionItem' && node.attrs?.id === actionId) {
      node.attrs = { ...node.attrs, ...patch }
    }
  })
  return next
}

export function dedupeActionIds(doc, makeId) {
  const next = clone(doc)
  const seen = new Set()
  walk(next, (node) => {
    if (node.type !== 'actionItem') return
    const attrs = node.attrs || {}
    if (!attrs.id || seen.has(attrs.id)) {
      node.attrs = { ...attrs, id: makeId() }
    }
    seen.add(node.attrs.id)
  })
  return next
}

export function isActionOverdue(action, todayStr) {
  return action.status === 'aberta' && !!action.dueDate && action.dueDate < todayStr
}
