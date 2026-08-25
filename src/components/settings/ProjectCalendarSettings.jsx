import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Copy, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CALENDAR_PRESETS, DURATION_DISPLAY_OPTIONS, calendarsOf, defaultCalendarOf,
  calendarAssignmentCount, durationDisplayOf, isValidISODate, isValidTime,
} from '../../utils/calendar';
import { minutesPerDay } from '../../utils/worktime';
import { formatDateLong } from '../../utils/schedule';

const WEEKDAYS = [
  { id: 1, label: 'S', full: 'Segunda' },
  { id: 2, label: 'T', full: 'Terça' },
  { id: 3, label: 'Q', full: 'Quarta' },
  { id: 4, label: 'Q', full: 'Quinta' },
  { id: 5, label: 'S', full: 'Sexta' },
  { id: 6, label: 'S', full: 'Sábado' },
  { id: 0, label: 'D', full: 'Domingo' },
];

function newCalendarId(calendars) {
  let index = calendars.length + 1;
  while (calendars.some((calendar) => calendar.id === `cal-${index}`)) index += 1;
  return `cal-${index}`;
}

function uniqueName(calendars, name) {
  if (!calendars.some((calendar) => calendar.name === name)) return name;
  let index = 2;
  while (calendars.some((calendar) => calendar.name === `${name} ${index}`)) index += 1;
  return `${name} ${index}`;
}

export default function ProjectCalendarSettings({ project, tasks = [], onChange, showToast }) {
  const calendars = calendarsOf(project);
  const defaultId = defaultCalendarOf(project).id;
  const [editingId, setEditingId] = useState(defaultId);
  const [newHoliday, setNewHoliday] = useState('');
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (!calendars.some((calendar) => calendar.id === editingId)) setEditingId(defaultId);
  }, [calendars, editingId, defaultId]);

  useEffect(() => setDrafts({}), [project?.id, editingId]);

  const calendar = calendars.find((item) => item.id === editingId) || calendars[0];
  const assignedTasks = calendarAssignmentCount(tasks, calendar?.id);
  const cannotRemoveCalendar = calendars.length <= 1 || calendar?.id === defaultId || assignedTasks > 0;
  const removeTitle = calendar?.id === defaultId
    ? 'O calendário padrão do projeto não pode ser excluído'
    : assignedTasks
      ? `${assignedTasks} tarefa${assignedTasks === 1 ? '' : 's'} ainda usa${assignedTasks === 1 ? '' : 'm'} este calendário`
      : 'Excluir calendário';
  const commitCalendars = (nextCalendars, nextDefaultId = project?.defaultCalendarId || defaultId) =>
    onChange({ calendars: nextCalendars, defaultCalendarId: nextDefaultId });
  const patchCalendar = (changes) => onChange({ calendarChanges: { id: calendar.id, changes } });

  const toggleWeekday = (day) => {
    const workdays = calendar.workdays.includes(day)
      ? calendar.workdays.filter((item) => item !== day)
      : [...calendar.workdays, day].sort();
    if (workdays.length) patchCalendar({ workdays });
  };

  const draftKey = (index, field) => `${calendar.id}:${index}:${field}`;
  const valueOf = (shift, index, field) => drafts[draftKey(index, field)] ?? shift[field];
  const shiftsWithDraft = (index, field, value) => calendar.shifts.map((shift, currentIndex) => ({
    from: currentIndex === index && field === 'from' ? value.trim() : String(valueOf(shift, currentIndex, 'from')).trim(),
    to: currentIndex === index && field === 'to' ? value.trim() : String(valueOf(shift, currentIndex, 'to')).trim(),
  }));
  const validShifts = (shifts) => shifts.every((shift) => isValidTime(shift.from) && isValidTime(shift.to) && shift.to > shift.from);

  const updateShift = (index, field, value) => {
    setDrafts((current) => ({ ...current, [draftKey(index, field)]: value }));
    const shifts = shiftsWithDraft(index, field, value);
    if (validShifts(shifts)) patchCalendar({ shifts });
  };

  const settleShift = (index, field, value) => {
    const shifts = shiftsWithDraft(index, field, value);
    if (validShifts(shifts)) patchCalendar({ shifts });
    else setDrafts((current) => {
      const next = { ...current };
      delete next[draftKey(index, field)];
      return next;
    });
  };

  const addCalendar = (preset) => {
    const id = newCalendarId(calendars);
    const copy = { ...preset, id, name: uniqueName(calendars, preset.name) };
    commitCalendars([...calendars, copy]);
    setEditingId(id);
  };

  const removeCalendar = () => {
    if (cannotRemoveCalendar) return;
    commitCalendars(calendars.filter((item) => item.id !== calendar.id));
    setEditingId(defaultId);
  };

  const addHoliday = () => {
    if (!isValidISODate(newHoliday) || calendar.holidays.includes(newHoliday)) return;
    patchCalendar({ holidays: [...calendar.holidays, newHoliday].sort() });
    setNewHoliday('');
  };

  const setProjectDisplay = (durationDisplay) => onChange({
    calendarSettings: { ...(project?.calendarSettings || {}), durationDisplay },
  });

  if (!calendar) return null;
  const hoursPerDay = Math.round((minutesPerDay(calendar) / 60) * 10) / 10;

  return (
    <div className="flex flex-col gap-5">
      <section className="border-b border-line pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-brand" />
              <h2 className="text-lg font-semibold tracking-tight text-text-1">Calendário do projeto</h2>
            </div>
            <p className="mt-1 max-w-2xl text-small leading-relaxed text-text-2">
              Organize a jornada que governa o Gantt. A duração em horas permanece em horas; dias usam a carga útil deste calendário.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-micro font-medium text-brand">{hoursPerDay}h/dia</span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold text-text-1">Biblioteca de calendários</h3>
            <p className="text-small text-text-2">O calendário padrão é herdado pelas tarefas sem uma escolha específica.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {calendars.map((item) => (
            <div key={item.id} className={`flex items-center gap-2 rounded-[8px] border p-3 transition-colors ${item.id === calendar.id ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface-1'}`}>
              <button type="button" onClick={() => setEditingId(item.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-small font-medium text-text-1">{item.name}</span>
                <span className="text-micro text-text-3">{Math.round((minutesPerDay(item) / 60) * 10) / 10}h/dia · {item.workdays.length} dias úteis</span>
              </button>
              <button type="button" onClick={() => commitCalendars(calendars, item.id)} title="Definir como padrão" className={`grid size-7 place-items-center rounded-[5px] ${item.id === defaultId ? 'bg-brand text-white' : 'bg-surface-3 text-text-3 hover:text-text-1'}`}><Check size={13} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CALENDAR_PRESETS.map((preset) => <Button key={preset.id} type="button" variant="outline" size="xs" onClick={() => addCalendar(preset)}><Copy data-icon="inline-start" size={13} /> {preset.name}</Button>)}
        </div>
      </section>

      <section className="border-t border-line pt-5">
        <div className="flex items-center gap-2">
          <input value={calendar.name} onChange={(event) => patchCalendar({ name: event.target.value })} className="h-9 min-w-0 flex-1 rounded-[6px] border border-line bg-surface-0 px-3 text-body font-medium text-text-1" />
          <Button type="button" variant="ghost" size="icon-sm" onClick={removeCalendar} disabled={cannotRemoveCalendar} title={removeTitle}><Trash2 size={15} /></Button>
        </div>
        {assignedTasks > 0 && (
          <p className="mt-2 text-small text-text-2">
            {assignedTasks} tarefa{assignedTasks === 1 ? '' : 's'} usa{assignedTasks === 1 ? '' : 'm'} este calendário. Reatribua-a{assignedTasks === 1 ? '' : 's'} antes de excluí-lo.
          </p>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <SettingBlock title="Exibição de duração" description="Aplicada a todo o projeto, em todas as telas.">
            <select value={durationDisplayOf(project)} onChange={(event) => setProjectDisplay(event.target.value)} className="h-9 w-full rounded-[6px] border border-line bg-surface-0 px-2 text-small text-text-1">
              {DURATION_DISPLAY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </SettingBlock>
          <SettingBlock title="Dias úteis" description="O motor não agenda tarefas fora destes dias.">
            <div className="flex gap-1.5">
              {WEEKDAYS.map((day) => <button key={day.id} type="button" title={day.full} onClick={() => toggleWeekday(day.id)} className={`size-8 rounded-[6px] text-micro font-semibold ${calendar.workdays.includes(day.id) ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-text-3'}`}>{day.label}</button>)}
            </div>
          </SettingBlock>
        </div>

        <SettingBlock title="Turnos de trabalho" description="Você pode dividir o dia em vários intervalos. Alterações são salvas no projeto." className="mt-5">
          <div className="flex max-w-xl flex-col gap-2">
            {calendar.shifts.map((shift, index) => <div key={index} className="flex items-center gap-2">
              <input value={valueOf(shift, index, 'from')} onChange={(event) => updateShift(index, 'from', event.target.value)} onBlur={(event) => settleShift(index, 'from', event.target.value)} className="h-9 w-28 rounded-[6px] border border-line bg-surface-0 px-2 text-small tabular-nums text-text-1" aria-label={`Início do turno ${index + 1}`} />
              <span className="text-small text-text-3">até</span>
              <input value={valueOf(shift, index, 'to')} onChange={(event) => updateShift(index, 'to', event.target.value)} onBlur={(event) => settleShift(index, 'to', event.target.value)} className="h-9 w-28 rounded-[6px] border border-line bg-surface-0 px-2 text-small tabular-nums text-text-1" aria-label={`Fim do turno ${index + 1}`} />
              <Button type="button" variant="ghost" size="icon-sm" disabled={calendar.shifts.length <= 1} onClick={() => patchCalendar({ shifts: calendar.shifts.filter((_, currentIndex) => currentIndex !== index) })} title="Remover turno"><X size={15} /></Button>
            </div>)}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => patchCalendar({ shifts: [...calendar.shifts, { from: '18:00', to: '20:00' }] })}><Plus data-icon="inline-start" size={14} /> Adicionar turno</Button>
          </div>
        </SettingBlock>

        <SettingBlock title={`Feriados (${calendar.holidays.length})`} description="Feriados bloqueiam o agendamento em todos os turnos deste calendário." className="mt-5">
          <div className="max-w-xl">
            {calendar.holidays.length > 0 && <ul className="mb-3 divide-y divide-line rounded-[6px] border border-line">{calendar.holidays.map((holiday) => <li key={holiday} className="flex items-center gap-2 px-3 py-2"><span className="flex-1 text-small text-text-1">{formatDateLong(holiday)}</span><button type="button" onClick={() => patchCalendar({ holidays: calendar.holidays.filter((item) => item !== holiday) })} className="text-text-3 hover:text-sched-late" title="Remover feriado"><X size={14} /></button></li>)}</ul>}
            <div className="flex items-center gap-2"><input type="date" value={newHoliday} onChange={(event) => setNewHoliday(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addHoliday()} className="h-9 rounded-[6px] border border-line bg-surface-0 px-2 text-small text-text-1" /><Button type="button" variant="outline" size="sm" disabled={!isValidISODate(newHoliday)} onClick={addHoliday}><Plus data-icon="inline-start" size={14} /> Adicionar feriado</Button></div>
          </div>
        </SettingBlock>
      </section>
    </div>
  );
}

function SettingBlock({ title, description, className = '', children }) {
  return <div className={className}><h3 className="text-body font-semibold text-text-1">{title}</h3><p className="mb-2 mt-0.5 text-small text-text-2">{description}</p>{children}</div>;
}
