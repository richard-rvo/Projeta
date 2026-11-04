import { useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const LABEL = 'text-micro font-medium text-text-3'

/** Título e metadados da ata. Cada mudança chega por `onChange({ campo: valor })`. */
export default function MinuteHeader({ minute, onChange }) {
  const participantsRef = useRef(null)
  useLayoutEffect(() => {
    const el = participantsRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [minute.participants])

  const id = (field) => `minute-${minute.id}-${field}`

  return (
    <header className="flex flex-col gap-3">
      <input
        id={id('title')}
        aria-label="Título da ata"
        value={minute.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Título da ata"
        className="w-full border-0 bg-transparent p-0 text-display font-semibold text-text-1 outline-none placeholder:text-text-3 focus-visible:ring-2 focus-visible:ring-brand"
      />
      <div className="grid gap-3 md:grid-cols-[12rem_1fr_2fr]">
        <div className="flex flex-col gap-1">
          <label htmlFor={id('meetingAt')} className={LABEL}>Data e hora</label>
          <Input
            id={id('meetingAt')}
            type="datetime-local"
            className="tabular-nums"
            value={minute.meetingAt || ''}
            onChange={(e) => onChange({ meetingAt: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('location')} className={LABEL}>Local</label>
          <Input
            id={id('location')}
            value={minute.location || ''}
            onChange={(e) => onChange({ location: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('participants')} className={LABEL}>Participantes</label>
          <Textarea
            id={id('participants')}
            ref={participantsRef}
            rows={1}
            className="min-h-8 resize-none overflow-hidden"
            value={minute.participants || ''}
            onChange={(e) => onChange({ participants: e.target.value })}
          />
        </div>
      </div>
    </header>
  )
}
