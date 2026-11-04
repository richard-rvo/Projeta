import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EMPTY_DOC } from '../minuteDoc'
import { ActionItem } from './ActionItem'
import { Decision } from './Decision'
import { SlashCommand } from './SlashCommand'
import { syncContent } from './syncContent'

const PLACEHOLDER = { heading: 'Título', decision: 'Descreva a decisão' }
const placeholder = ({ node }) => PLACEHOLDER[node.type.name] ?? 'Digite / para inserir um bloco'
const checkboxLabel = (node, checked) =>
  `${checked ? 'Desmarcar' : 'Marcar'} item: ${node.textContent || 'vazio'}`
const EDITOR_ATTRIBUTES = { class: 'minute-doc', 'aria-label': 'Conteúdo da ata' }
const CONTENT_ERROR =
  'Esta ata contém um bloco que esta versão do Projeta não reconhece. Recarregue a página para editar.'
const noop = () => {}

/**
 * Editor de blocos da ata (TipTap).
 *
 * Contrato:
 * - Monte com `key={minute.id}`: cada ata ganha um editor novo, com histórico
 *   de desfazer próprio. `content` é o documento ProseMirror (JSON) da ata.
 * - `content` que muda depois (ex.: o painel de ações gravou `taskId` via
 *   `updateActionInDoc`) é aplicado no lugar, só o trecho diferente, fora do
 *   histórico e sem disparar `onChange`. Derive essa mudança do último doc
 *   recebido em `onChange`: um doc velho desfaria o que foi digitado depois.
 *   O eco do próprio `onChange` (o mesmo objeto) é ignorado.
 * - `onChange(doc)` recebe `editor.getJSON()` a cada transação que altera o
 *   documento, só com `editable`.
 * - Na ação: "Criar tarefa" chama `onCreateTask(actionId)`; com `taskId`,
 *   "Ver tarefa" chama `onOpenTask(taskId)`.
 * - `content` com bloco que o esquema não conhece: o editor trava, nunca
 *   emite `onChange` (o TipTap carregaria um doc vazio, e o autosave o
 *   gravaria por cima da ata), mostra um aviso e chama `onContentError(error)`.
 *
 * @param {{
 *   content: object,
 *   editable?: boolean,
 *   onChange?: (doc: object) => void,
 *   onCreateTask?: (actionId: string) => void,
 *   onOpenTask?: (taskId: string) => void,
 *   onContentError?: (error: Error) => void,
 * }} props
 */
export default function MinuteEditor({
  content,
  editable = true,
  onChange = noop,
  onCreateTask = noop,
  onOpenTask = noop,
  onContentError = noop,
}) {
  const latest = useRef(null)
  latest.current = { onChange, onCreateTask, onOpenTask, onContentError }
  const emitted = useRef(content)
  const invalid = useRef(null)
  const reported = useRef(null)
  const [contentError, setContentError] = useState(null)
  const [initialContent] = useState(() => content ?? EMPTY_DOC)
  // A trava fica na view: o useEditor reaplica `editable` das opções logo
  // depois de montar, o que desfaria um setEditable(false).
  const [editorProps] = useState(() => ({
    attributes: EDITOR_ATTRIBUTES,
    editable: () => !invalid.current,
  }))

  const extensions = useMemo(
    () => [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true, a11y: { checkboxLabel } }),
      Placeholder.configure({ placeholder }),
      ActionItem.configure({
        onCreateTask: (actionId) => latest.current.onCreateTask(actionId),
        onOpenTask: (taskId) => latest.current.onOpenTask(taskId),
      }),
      Decision,
      SlashCommand,
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    editorProps,
    enableContentCheck: true,
    onContentError: ({ error }) => {
      invalid.current = error
    },
    onUpdate: ({ editor: current, transaction, appendedTransactions }) => {
      // No modo leitura nenhuma mudança é do usuário (o parágrafo final
      // automático, por exemplo): não há o que gravar.
      if (invalid.current || !current.isEditable) return
      if (![transaction, ...appendedTransactions].some((tr) => tr.docChanged)) return
      const doc = current.getJSON()
      emitted.current = doc
      latest.current.onChange(doc)
    },
  })

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  // O erro nasce ao criar o editor, no meio do render: o aviso vem depois.
  useEffect(() => {
    const error = invalid.current
    if (!error || reported.current === error) return
    reported.current = error
    setContentError(error)
    latest.current.onContentError(error)
  }, [editor])

  useEffect(() => {
    if (!editor || !content || content === emitted.current) return
    emitted.current = content
    syncContent(editor, content)
  }, [editor, content])

  return (
    <div className="minute-editor">
      {contentError && (
        <p className="minute-editor__alert" role="alert">
          {CONTENT_ERROR}
        </p>
      )}
      <EditorContent editor={editor} hidden={Boolean(contentError)} />
    </div>
  )
}
