import { Plus } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ViewBarButton } from '@/components/shell/ViewBar'
import { MINUTE_TEMPLATES } from './templates'

/** Botão primário "Nova ata" com os modelos disponíveis. */
export default function NewMinuteMenu({ onCreate }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ViewBarButton variant="primary" icon={Plus}>Nova ata</ViewBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MINUTE_TEMPLATES.map((template) => (
          <DropdownMenuItem key={template.id} onSelect={() => onCreate(template.id)}>
            {template.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
