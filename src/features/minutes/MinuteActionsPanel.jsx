import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ViewBarSegments } from '../../components/shell/ViewBar'
import { buildNewTask } from '../../utils/taskFactory'
import { formatDateShort, today } from '../../utils/schedule'
import { isActionOverdue } from './minuteDoc'

// tasks.name aceita 500 caracteres; a descrição da ação, até 1000.
export function createTaskFromAction(project, action, order) {
  return buildNewTask(project, {
    name: (action.description || '').slice(0, 500),
    order,
    startDay: action.dueDate ?? undefined,
    workingDays: 1,
  })
}

const FILTERS = [
  { id: 'aberta', label: 'Abertas' },
  { id: 'todas', label: 'Todas' },
]

const WIDE_QUERY = '(min-width: 1280px)'

export function useWideScreen() {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY) : null
  const [wide, setWide] = useState(query ? query.matches : true)
  useEffect(() => {
    if (!query) return undefined
    const onChange = (e) => setWide(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [query])
  return wide
}

const btn =
  'shrink-0 rounded-[5px] px-1.5 py-0.5 text-micro font-medium text-text-2 transition-colors hover:bg-surface-3 hover:text-text-1'

function ActionRow({ action, overdue, onCreateTask, onViewTask, onStatusChange }) {
  const done = action.status !== 'aberta'
  return (
    <li className="flex flex-col gap-1 border-b border-line px-3 py-2.5">
      <p className={cn('text-small leading-snug text-text-1', done && 'text-text-3 line-through')}>
        {action.description || 'Sem descrição'}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-micro text-text-3">
        <span>{action.ownerName || 'Sem responsável'}</span>
        {action.dueDate && (
          <span className={cn('tabular-nums', overdue && 'font-semibold text-sched-late')}>
            {formatDateShort(action.dueDate)}
            {overdue && <span> · Atrasada</span>}
          </span>
        )}
      </p>
      <div className="flex gap-1">
        {action.taskId ? (
          <button type="button" className={btn} onClick={() => onViewTask(action.taskId)}>Ver tarefa</button>
        ) : (
          <button type="button" className={btn} disabled={!action.description} onClick={() => onCreateTask(action.id)}>
            Criar tarefa
          </button>
        )}
        <button type="button" className={btn} onClick={() => onStatusChange(action.id, done ? 'aberta' : 'concluída')}>
          {done ? 'Reabrir' : 'Concluir'}
        </button>
      </div>
    </li>
  )
}

export default function MinuteActionsPanel({ actions, onCreateTask, onViewTask, onStatusChange }) {
  const [filter, setFilter] = useState('aberta')
  const todayStr = today()
  const shown = actions.filter((a) => a.id && (filter === 'todas' || a.status === 'aberta'))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-body font-semibold text-text-1">Ações</h2>
        <ViewBarSegments className="ml-auto" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {shown.length ? (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((a) => (
            <ActionRow
              key={a.id}
              action={a}
              overdue={isActionOverdue(a, todayStr)}
              onCreateTask={onCreateTask}
              onViewTask={onViewTask}
              onStatusChange={onStatusChange}
            />
          ))}
        </ul>
      ) : (
        <p className="p-4 text-center text-small text-text-3">
          {filter === 'aberta' ? 'Nenhuma ação aberta nesta ata.' : 'Nenhuma ação nesta ata.'}
        </p>
      )}
    </div>
  )
}

/** Coluna de 300px em telas largas; Sheet abaixo de 1280px. */
export function MinuteActionsDock({ open, onOpenChange, wide, ...panelProps }) {
  if (wide) {
    return open ? (
      <aside aria-label="Ações da ata" className="flex w-[300px] shrink-0 flex-col border-l border-line bg-surface-1">
        <MinuteActionsPanel {...panelProps} />
      </aside>
    ) : null
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[320px] p-0">
        <SheetTitle className="sr-only">Ações da ata</SheetTitle>
        <SheetDescription className="sr-only">Ações registradas nesta ata.</SheetDescription>
        <MinuteActionsPanel {...panelProps} />
      </SheetContent>
    </Sheet>
  )
}
