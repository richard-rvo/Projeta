// Nó `actionItem` com NodeView em React: status, texto, responsável, prazo e
// o atalho para a tarefa. O esquema mora em actionItemNode.js.
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import { Check, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { generateId } from '../../../utils/ids'
import { formatDateShort, today } from '../../../utils/schedule'
import { isActionOverdue } from '../minuteDoc'
import { ACTION_STATUSES, ActionItemNode } from './actionItemNode'

const STATUS_LABEL = { aberta: 'Aberta', concluída: 'Concluída', cancelada: 'Cancelada' }
const STATUS_ICON = { concluída: Check, cancelada: X }

// Alvo de 26px (mínimo do DESIGN.md) com o círculo de 16px dentro.
function StatusButton({ status, editable, onChange }) {
  const Icon = STATUS_ICON[status]
  const label = `Status: ${STATUS_LABEL[status]}`
  const dot = <span className="minute-action__dot">{Icon && <Icon aria-hidden="true" />}</span>
  if (!editable) {
    return (
      <span className="minute-action__status" data-status={status} role="img" aria-label={label}>
        {dot}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="minute-action__status" data-status={status} aria-label={label} title={label}>
        {dot}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={status} onValueChange={onChange}>
          {ACTION_STATUSES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {STATUS_LABEL[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActionItemView({ node, editor, extension, updateAttributes }) {
  const { id, ownerName, dueDate, status, taskId } = node.attrs
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable })
  const late = isActionOverdue({ status, dueDate }, today()) ? 'true' : undefined
  const { onCreateTask, onOpenTask } = extension.options

  // Ação de modelo ainda sem id: ganha um antes de virar tarefa.
  const createTask = () => {
    const actionId = id || generateId()
    if (!id) updateAttributes({ id: actionId })
    onCreateTask(actionId)
  }

  return (
    <NodeViewWrapper className="minute-action" data-status={status}>
      <div className="minute-action__lead" contentEditable={false}>
        <StatusButton status={status} editable={editable} onChange={(value) => updateAttributes({ status: value })} />
      </div>
      <div className="minute-action__body">
        <NodeViewContent className="minute-action__text" />
        {editable && node.content.size === 0 && (
          <span className="minute-action__placeholder" contentEditable={false} aria-hidden="true">
            Descreva a ação
          </span>
        )}
      </div>
      <div className="minute-action__meta" contentEditable={false}>
        {editable ? (
          <>
            <input
              className="minute-chip"
              value={ownerName}
              placeholder="Responsável"
              aria-label="Responsável"
              onChange={(event) => updateAttributes({ ownerName: event.target.value })}
            />
            <input
              type="date"
              className="minute-chip"
              value={dueDate ?? ''}
              aria-label="Prazo"
              data-late={late}
              onChange={(event) => updateAttributes({ dueDate: event.target.value || null })}
            />
          </>
        ) : (
          <>
            {ownerName && <span className="minute-chip">{ownerName}</span>}
            {dueDate && (
              <time className="minute-chip" dateTime={dueDate} data-late={late}>
                {formatDateShort(dueDate)}
              </time>
            )}
          </>
        )}
        {taskId ? (
          <button type="button" className="minute-action__link" onClick={() => onOpenTask(taskId)}>
            Ver tarefa
          </button>
        ) : (
          editable && (
            <button type="button" className="minute-action__create" onClick={createTask}>
              Criar tarefa
            </button>
          )
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const ActionItem = ActionItemNode.extend({
  addOptions() {
    return { ...this.parent?.(), onCreateTask: () => {}, onOpenTask: () => {} }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ActionItemView)
  },
})
