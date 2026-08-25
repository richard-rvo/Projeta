import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, Copy, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  calendarsOf, defaultCalendarOf, CALENDAR_PRESETS, calendarAssignmentCount,
  DURATION_DISPLAY_OPTIONS, durationDisplayOf, isValidISODate, isValidTime,
} from '../../utils/calendar';
import { minutesPerDay } from '../../utils/worktime';
import { formatDateLong } from '../../utils/schedule';

const WEEKDAYS = [
  { id: 1, label: 'S', full: 'Segunda' }, { id: 2, label: 'T', full: 'Terça' },
  { id: 3, label: 'Q', full: 'Quarta' }, { id: 4, label: 'Q', full: 'Quinta' },
  { id: 5, label: 'S', full: 'Sexta' }, { id: 6, label: 'S', full: 'Sábado' },
  { id: 0, label: 'D', full: 'Domingo' },
];

function newId(existing) {
  let index = existing.length + 1;
  while (existing.some((calendar) => calendar.id === `cal-${index}`)) index += 1;
  return `cal-${index}`;
}

function CalendarSection({ title, description, children }) {
  return <section className="flex flex-col gap-2"><div><h3 className="text-small font-medium text-text-1">{title}</h3>{description && <p className="mt-0.5 text-micro text-text-3">{description}</p>}</div>{children}</section>;
}

export default function GanttCalendarMenu({ project, tasks = [], onChange, triggerLabel = 'Calendários', trigger }) {
  const calendars = calendarsOf(project);
  const defaultId = defaultCalendarOf(project).id;
  const [editingId, setEditingId] = useState(defaultId);
  const [newHoliday, setNewHoliday] = useState('');
  const [shiftDrafts, setShiftDrafts] = useState({});

  useEffect(() => { if (!calendars.some((calendar) => calendar.id === editingId)) setEditingId(defaultId); }, [calendars, editingId, defaultId]);
  useEffect(() => setShiftDrafts({}), [project?.id, editingId]);

  const calendar = calendars.find((item) => item.id === editingId) || calendars[0];
  const assignedTasks = calendarAssignmentCount(tasks, calendar?.id);
  const cannotRemove = calendars.length <= 1 || calendar?.id === defaultId || assignedTasks > 0;
  const hoursPerDay = Math.round((minutesPerDay(calendar) / 60) * 10) / 10;
  const durationDisplay = durationDisplayOf(project);
  const commit = (nextCalendars, nextDefaultId = project?.defaultCalendarId || defaultId) => onChange({ calendars: nextCalendars, defaultCalendarId: nextDefaultId });
  const patch = (changes) => onChange({ calendarChanges: { id: calendar.id, changes } });
  const shiftKey = (index, key) => `${calendar.id}:${index}:${key}`;
  const shiftValue = (shift, index, key) => shiftDrafts[shiftKey(index, key)] ?? shift[key];
  const effectiveShifts = (changedIndex, changedKey, changedValue) => calendar.shifts.map((shift, index) => ({
    from: index === changedIndex && changedKey === 'from' ? changedValue.trim() : String(shiftValue(shift, index, 'from') || '').trim(),
    to: index === changedIndex && changedKey === 'to' ? changedValue.trim() : String(shiftValue(shift, index, 'to') || '').trim(),
  }));
  const canSaveShifts = (shifts) => shifts.every((shift) => isValidTime(shift.from) && isValidTime(shift.to) && shift.to > shift.from);
  const setShift = (index, key, value) => {
    setShiftDrafts((drafts) => ({ ...drafts, [shiftKey(index, key)]: value }));
    const shifts = effectiveShifts(index, key, value);
    if (canSaveShifts(shifts)) patch({ shifts });
  };
  const settleShift = (index, key, value) => {
    const shifts = effectiveShifts(index, key, value);
    if (canSaveShifts(shifts)) { patch({ shifts }); return; }
    setShiftDrafts((drafts) => { const next = { ...drafts }; delete next[shiftKey(index, key)]; return next; });
  };
  const addHoliday = () => {
    if (!isValidISODate(newHoliday) || calendar.holidays.includes(newHoliday)) return;
    patch({ holidays: [...calendar.holidays, newHoliday].sort() }); setNewHoliday('');
  };
  const addFromPreset = (preset) => {
    const id = newId(calendars);
    const copy = { ...preset, id, name: uniqueName(calendars, preset.name) };
    commit([...calendars, copy]); setEditingId(id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger || <Button type="button" variant="outline" size="sm"><CalendarDays data-icon="inline-start" />{triggerLabel}</Button>}</PopoverTrigger>
      <PopoverContent align="end" className="w-[min(94vw,44rem)] overflow-hidden p-0">
        <PopoverHeader className="border-b border-line bg-surface-2 px-4 py-3">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-brand-soft text-brand"><CalendarDays size={18} /></span><div className="min-w-0 flex-1"><PopoverTitle>Calendários do projeto</PopoverTitle><PopoverDescription>Jornadas, dias úteis e feriados que orientam todas as tarefas.</PopoverDescription></div><Badge variant="outline"><Clock3 />{hoursPerDay}h/dia</Badge></div>
        </PopoverHeader>
        <div className="grid max-h-[min(34rem,calc(100vh-7rem))] grid-cols-[10.5rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-surface-2/50 p-2">
            <p className="px-2 pb-1 pt-1 text-micro font-medium uppercase tracking-wide text-text-3">Biblioteca</p>
            <div className="min-h-0 flex-1 overflow-y-auto">{calendars.map((item) => <button key={item.id} type="button" onClick={() => setEditingId(item.id)} className={`mb-1 flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-2 text-left text-small transition-colors ${item.id === calendar.id ? 'bg-surface-1 text-text-1 shadow-xs ring-1 ring-line-strong' : 'text-text-2 hover:bg-surface-3 hover:text-text-1'}`}><span className="min-w-0 flex-1 truncate">{item.name}</span>{item.id === defaultId && <Check size={13} className="shrink-0 text-brand" />}</button>)}</div>
            <Separator className="my-2" /><p className="px-2 pb-1 text-micro text-text-3">Adicionar a partir de</p>
            <div className="flex flex-wrap gap-1 px-1">{CALENDAR_PRESETS.map((preset) => <Button key={preset.id} type="button" variant="ghost" size="xs" onClick={() => addFromPreset(preset)} title={`Criar “${preset.name}”`}><Copy data-icon="inline-start" />{preset.name}</Button>)}</div>
          </aside>
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="flex items-center gap-2"><Input value={calendar.name} onChange={(event) => patch({ name: event.target.value })} aria-label="Nome do calendário" className="font-medium" />{calendar.id === defaultId ? <Badge variant="onTrack">Padrão</Badge> : <Button type="button" variant="outline" size="xs" onClick={() => commit(calendars, calendar.id)}><Check data-icon="inline-start" />Definir padrão</Button>}<Button type="button" variant="destructiveGhost" size="icon-xs" onClick={() => { if (!cannotRemove) { commit(calendars.filter((item) => item.id !== calendar.id)); setEditingId(defaultId); } }} disabled={cannotRemove} title={cannotRemove ? assignedTasks ? `${assignedTasks} tarefa(s) ainda usa(m) este calendário` : 'O calendário padrão não pode ser excluído' : 'Excluir calendário'} aria-label="Excluir calendário"><Trash2 /></Button></div>
            <p className="mt-1.5 text-micro text-text-3">{assignedTasks ? `${assignedTasks} tarefa(s) usam este calendário explicitamente.` : 'Nenhuma tarefa usa este calendário explicitamente.'}</p>
            <Separator className="my-4" />
            <div className="grid gap-5 sm:grid-cols-2">
              <CalendarSection title="Dias úteis" description="O motor não agenda trabalho fora destes dias."><ToggleGroup type="multiple" value={calendar.workdays.map(String)} onValueChange={(values) => { const workdays = values.map(Number).sort(); if (workdays.length) patch({ workdays }); }} size="xs" className="w-full justify-between">{WEEKDAYS.map((day) => <ToggleGroupItem key={day.id} value={String(day.id)} aria-label={day.full} title={day.full}>{day.label}</ToggleGroupItem>)}</ToggleGroup></CalendarSection>
              <CalendarSection title="Exibição de duração" description="Também define a unidade implícita na edição."><ToggleGroup type="single" value={durationDisplay} onValueChange={(value) => value && onChange({ calendarSettings: { ...(project?.calendarSettings || {}), durationDisplay: value } })} size="xs" className="w-full">{DURATION_DISPLAY_OPTIONS.map((option) => <ToggleGroupItem key={option.id} value={option.id} className="flex-1" title={option.description}>{option.label.replace('Sempre em ', '')}</ToggleGroupItem>)}</ToggleGroup></CalendarSection>
            </div>
            <Separator className="my-4" />
            <CalendarSection title="Jornada de trabalho" description="Intervalos entre turnos não contam como duração útil."><div className="flex flex-col gap-2">{calendar.shifts.map((shift, index) => <div key={index} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 p-2"><Input type="text" inputMode="numeric" maxLength={5} value={shiftValue(shift, index, 'from')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setShift(index, 'from', event.target.value)} onBlur={(event) => settleShift(index, 'from', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`Início do turno ${index + 1}`} className="h-7 text-small tabular-nums" /><span className="text-small text-text-3">até</span><Input type="text" inputMode="numeric" maxLength={5} value={shiftValue(shift, index, 'to')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setShift(index, 'to', event.target.value)} onBlur={(event) => settleShift(index, 'to', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`Término do turno ${index + 1}`} className="h-7 text-small tabular-nums" /><Button type="button" variant="ghost" size="icon-xs" onClick={() => { if (calendar.shifts.length > 1) patch({ shifts: calendar.shifts.filter((_, itemIndex) => itemIndex !== index) }); }} disabled={calendar.shifts.length <= 1} aria-label={`Remover turno ${index + 1}`}><X /></Button></div>)}<Button type="button" variant="outline" size="xs" onClick={() => patch({ shifts: [...calendar.shifts, { from: '18:00', to: '20:00' }] })} className="self-start"><Plus data-icon="inline-start" />Adicionar turno</Button></div></CalendarSection>
            <Separator className="my-4" />
            <CalendarSection title={`Feriados (${calendar.holidays.length})`} description="Feriados não consomem horas de duração."><div className="flex flex-col gap-1">{calendar.holidays.map((holiday) => <div key={holiday} className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-surface-2"><span className="flex-1 text-small tabular-nums text-text-1">{formatDateLong(holiday)}</span><Button type="button" variant="ghost" size="icon-xs" onClick={() => patch({ holidays: calendar.holidays.filter((item) => item !== holiday) })} aria-label={`Remover feriado ${formatDateLong(holiday)}`}><X /></Button></div>)}{!calendar.holidays.length && <p className="py-1 text-small text-text-3">Nenhum feriado cadastrado.</p>}</div><div className="flex gap-2"><Input type="date" value={newHoliday} onChange={(event) => setNewHoliday(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addHoliday()} aria-label="Novo feriado" className="h-7 text-small" /><Button type="button" variant="outline" size="xs" onClick={addHoliday} disabled={!isValidISODate(newHoliday)}><Plus data-icon="inline-start" />Adicionar</Button></div></CalendarSection>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function uniqueName(calendars, base) {
  if (!calendars.some((calendar) => calendar.name === base)) return base;
  let index = 2;
  while (calendars.some((calendar) => calendar.name === `${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}
