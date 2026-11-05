import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatMeetingAt, groupMinutesByMonth } from './groupMinutes'

/** Coluna de atas agrupadas por mês. */
export default function MinuteList({ minutes, activeId, onOpen, onDelete }) {
  const groups = groupMinutesByMonth(minutes)
  if (!groups.length) {
    return <p className="p-4 text-small text-text-3">Nenhuma ata encontrada.</p>
  }
  return (
    <nav aria-label="Atas" className="flex-1 overflow-y-auto p-2">
      {groups.map((group) => (
        <section key={group.key} className="mb-3">
          <h2 className="px-2 py-1 text-micro font-medium uppercase text-text-3">{group.label}</h2>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((minute) => (
              <li
                key={minute.id}
                className={cn(
                  'group flex items-start rounded-[var(--radius-control)] hover:bg-surface-3',
                  minute.id === activeId && 'bg-surface-3',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(minute.id)}
                  aria-current={minute.id === activeId ? 'true' : undefined}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left"
                >
                  <span className="truncate text-body font-medium text-text-1">
                    {minute.title || 'Sem título'}
                  </span>
                  <span className="truncate text-micro text-text-3">
                    <span className="tabular-nums">{formatMeetingAt(minute.meetingAt)}</span>
                    {minute.location ? ` · ${minute.location}` : ''}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Ações da ata ${minute.title || 'sem título'}`}
                      className="m-1 rounded-[var(--radius-control)] p-1 text-text-3 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onDelete(minute)}>Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
