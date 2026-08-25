import React, { useState, useEffect } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ViewBarButton } from '../../components/shell/ViewBar';
import { Calendar, X, Plus, Check, Copy } from 'lucide-react';
import {
  calendarsOf, defaultCalendarOf, CALENDAR_PRESETS,
  calendarAssignmentCount, DURATION_DISPLAY_OPTIONS, durationDisplayOf, isValidISODate, isValidTime,
} from '../../utils/calendar';
import { minutesPerDay } from '../../utils/worktime';
import { formatDateLong } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   BIBLIOTECA DE CALENDÁRIOS DO PROJETO
   ═══════════════════════════════════════════════════════════════

   Antes esta tela editava UM calendário: dias úteis e feriados, sem
   hora. Duas coisas faltavam para o cronograma bater com a realidade
   de uma parada de manutenção.

   · JORNADA — sem hora de abertura e fechamento não existe tarefa de
     quatro horas, e o encadeamento só sabia dizer "no dia seguinte".

   · MAIS DE UM CALENDÁRIO — a equipe administrativa roda 8h/dia e o
     turno de campo roda 24h. Com um calendário só, qualquer soma
     entre as duas estava errada, e o planejador corrigia à mão.

   A tarefa escolhe o calendário dela na coluna Calendário ou no
   Inspetor; vazio herda o padrão do projeto, que é o caso da
   esmagadora maioria.
   ═══════════════════════════════════════════════════════════════ */

const WEEKDAYS = [
  { id: 1, label: 'S', full: 'Segunda' },
  { id: 2, label: 'T', full: 'Terça' },
  { id: 3, label: 'Q', full: 'Quarta' },
  { id: 4, label: 'Q', full: 'Quinta' },
  { id: 5, label: 'S', full: 'Sexta' },
  { id: 6, label: 'S', full: 'Sábado' },
  { id: 0, label: 'D', full: 'Domingo' },
];

function newId(existing) {
  let i = existing.length + 1;
  while (existing.some((c) => c.id === `cal-${i}`)) i++;
  return `cal-${i}`;
}

export default function GanttCalendarMenu({ project, tasks = [], onChange, triggerLabel = 'Calendários' }) {
  const calendars = calendarsOf(project);
  const defaultId = defaultCalendarOf(project).id;

  const [editingId, setEditingId] = useState(defaultId);
  const [newHoliday, setNewHoliday] = useState('');
  const [shiftDrafts, setShiftDrafts] = useState({});

  /* Trocar de projeto pode apagar o calendário que estava aberto. */
  useEffect(() => {
    if (!calendars.some((c) => c.id === editingId)) setEditingId(defaultId);
  }, [calendars, editingId, defaultId]);

  const cal = calendars.find((c) => c.id === editingId) || calendars[0];
  const assignedTasks = calendarAssignmentCount(tasks, cal?.id);
  const cannotRemoveCalendar = calendars.length <= 1 || cal?.id === defaultId || assignedTasks > 0;

  useEffect(() => {
    setShiftDrafts({});
  }, [project?.id, editingId]);

  /** Grava a biblioteca inteira — é ela que o projeto guarda. */
  const commit = (nextCalendars, nextDefaultId = project?.defaultCalendarId || defaultId) =>
    onChange({ calendars: nextCalendars, defaultCalendarId: nextDefaultId });

  const patch = (changes) =>
    onChange({ calendarChanges: { id: cal.id, changes } });

  const toggleWeekday = (day) => {
    const next = cal.workdays.includes(day)
      ? cal.workdays.filter((d) => d !== day)
      : [...cal.workdays, day].sort();
    /* Um calendário sem nenhum dia útil travaria o agendador. */
    if (!next.length) return;
    patch({ workdays: next });
  };

  const shiftFieldKey = (index, key) => `${cal.id}:${index}:${key}`;

  const shiftValue = (shift, index, key) => shiftDrafts[shiftFieldKey(index, key)] ?? shift[key];

  const shiftsWithDraft = (index, key, value) => cal.shifts.map((s, i) => ({
    from: i === index && key === 'from'
      ? value.trim()
      : String(shiftValue(s, i, 'from') || '').trim(),
    to: i === index && key === 'to'
      ? value.trim()
      : String(shiftValue(s, i, 'to') || '').trim(),
  }));

  const canSaveShifts = (shifts) => shifts.every(
    (s) => isValidTime(s.from) && isValidTime(s.to) && s.to > s.from,
  );

  const setShift = (index, key, value) => {
    setShiftDrafts((drafts) => ({ ...drafts, [shiftFieldKey(index, key)]: value }));

    const shifts = shiftsWithDraft(index, key, value);
    /* Turno inválido ou invertido zeraria a jornada e faria toda
       tarefa deste calendário perder a duração. Enquanto a digitação
       está incompleta, mantemos só o rascunho em tela. */
    if (!canSaveShifts(shifts)) return;
    patch({ shifts });
  };

  const settleShift = (index, key, value) => {
    const shifts = shiftsWithDraft(index, key, value);
    if (canSaveShifts(shifts)) {
      patch({ shifts });
      return;
    }
    setShiftDrafts((drafts) => {
      const next = { ...drafts };
      delete next[shiftFieldKey(index, key)];
      return next;
    });
  };

  const effectiveShifts = () => cal.shifts.map((s, i) => ({
    from: String(shiftValue(s, i, 'from') || s.from).trim(),
    to: String(shiftValue(s, i, 'to') || s.to).trim(),
  }));

  const addShift = () => patch({ shifts: [...effectiveShifts(), { from: '18:00', to: '20:00' }] });

  const removeShift = (index) => {
    if (cal.shifts.length <= 1) return; // mesma razão do dia útil
    patch({ shifts: effectiveShifts().filter((_, i) => i !== index) });
  };

  const addHoliday = () => {
    if (!isValidISODate(newHoliday) || cal.holidays.includes(newHoliday)) return;
    patch({ holidays: [...cal.holidays, newHoliday].sort() });
    setNewHoliday('');
  };

  const addFromPreset = (preset) => {
    const id = newId(calendars);
    const copy = { ...preset, id, name: uniqueName(calendars, preset.name) };
    commit([...calendars, copy]);
    setEditingId(id);
  };

  const removeCalendar = () => {
    /* O projeto precisa de pelo menos um, e o padrão não pode sumir
       debaixo das tarefas que o herdam. */
    if (cannotRemoveCalendar) return;
    commit(calendars.filter((c) => c.id !== cal.id));
    setEditingId(defaultId);
  };

  const hoursPerDay = Math.round((minutesPerDay(cal) / 60) * 10) / 10;
  const durationDisplay = durationDisplayOf(project);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ViewBarButton icon={Calendar}>{triggerLabel}</ViewBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* ── Biblioteca ─────────────────────────────────────── */}
        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Calendários do projeto
        </DropdownMenuLabel>

        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {calendars.map((c) => (
            <div
              key={c.id}
              className={
                'flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 transition-colors '
                + (c.id === cal.id ? 'bg-surface-3' : 'hover:bg-surface-2')
              }
            >
              <button
                type="button"
                onClick={() => setEditingId(c.id)}
                className="min-w-0 flex-1 truncate text-left text-small text-text-1"
              >
                {c.name}
              </button>
              <button
                type="button"
                title={c.id === defaultId ? 'Padrão do projeto' : 'Tornar padrão do projeto'}
                onClick={() => commit(calendars, c.id)}
                className={
                  'grid size-5 shrink-0 place-items-center rounded-[4px] '
                  + (c.id === defaultId ? 'text-brand' : 'text-text-3 hover:text-text-1')
                }
              >
                <Check size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {CALENDAR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addFromPreset(p)}
              title={`Criar a partir de "${p.name}"`}
              className="flex items-center gap-1 rounded-[5px] bg-surface-3 px-1.5 py-1 text-micro text-text-2 transition-colors hover:text-text-1"
            >
              <Copy size={10} /> {p.name}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />

        {/* ── Calendário aberto ──────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <input
            value={cal.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-surface-0 px-1.5 text-small font-medium text-text-1"
          />
          <span className="shrink-0 text-micro tabular-nums text-text-3">{hoursPerDay}h/dia</span>
          <button
            type="button"
            onClick={removeCalendar}
            disabled={cannotRemoveCalendar}
            title={cal.id === defaultId
              ? 'O padrão do projeto não pode ser excluído'
              : assignedTasks
                ? `${assignedTasks} tarefa${assignedTasks === 1 ? '' : 's'} ainda usa${assignedTasks === 1 ? '' : 'm'} este calendário`
                : 'Excluir calendário'}
            className="grid size-6 shrink-0 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-sched-late-soft hover:text-sched-late disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-3"
          >
            <X size={12} />
          </button>
        </div>

        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Exibição de duração
        </DropdownMenuLabel>
        <div className="px-2 pb-2">
          <select
            value={durationDisplay}
            onChange={(e) => onChange({
              calendarSettings: {
                ...(project?.calendarSettings || {}),
                durationDisplay: e.target.value,
              },
            })}
            className="h-7 w-full rounded-[5px] border border-line bg-surface-0 px-1.5 text-small text-text-1"
          >
            {DURATION_DISPLAY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>

        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Dias úteis
        </DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-2">
          {WEEKDAYS.map((d) => {
            const on = cal.workdays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                title={d.full}
                onClick={() => toggleWeekday(d.id)}
                className={
                  'size-7 rounded-[6px] text-micro font-semibold transition-colors '
                  + (on
                    ? 'bg-brand-soft text-brand'
                    : 'bg-surface-3 text-text-3 hover:text-text-2')
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Jornada
        </DropdownMenuLabel>
        <div className="flex flex-col gap-1 px-2 pb-2">
          {cal.shifts.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="08:00"
                value={shiftValue(s, i, 'from')}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setShift(i, 'from', e.target.value)}
                onBlur={(e) => settleShift(i, 'from', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  settleShift(i, 'from', e.currentTarget.value);
                  e.currentTarget.blur();
                }}
                aria-label={`Início do turno ${i + 1}`}
                className="h-7 flex-1 rounded-[5px] border border-line bg-surface-0 px-1.5 text-micro tabular-nums text-text-1"
              />
              <span className="text-micro text-text-3">às</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="17:00"
                value={shiftValue(s, i, 'to')}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setShift(i, 'to', e.target.value)}
                onBlur={(e) => settleShift(i, 'to', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  settleShift(i, 'to', e.currentTarget.value);
                  e.currentTarget.blur();
                }}
                aria-label={`Fim do turno ${i + 1}`}
                className="h-7 flex-1 rounded-[5px] border border-line bg-surface-0 px-1.5 text-micro tabular-nums text-text-1"
              />
              <button
                type="button"
                onClick={() => removeShift(i)}
                disabled={cal.shifts.length <= 1}
                className="grid size-6 shrink-0 place-items-center rounded-[4px] text-text-3 transition-colors hover:bg-sched-late-soft hover:text-sched-late disabled:opacity-30"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addShift}
            className="flex items-center justify-center gap-1 rounded-[5px] bg-surface-3 py-1 text-micro text-text-2 transition-colors hover:text-text-1"
          >
            <Plus size={11} /> Adicionar turno
          </button>
        </div>

        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Feriados ({cal.holidays.length})
        </DropdownMenuLabel>

        <div className="max-h-32 overflow-auto px-2">
          {cal.holidays.length === 0 ? (
            <p className="px-1 pb-2 text-micro text-text-3">Nenhum cadastrado.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 pb-1">
              {cal.holidays.map((h) => (
                <li key={h} className="flex items-center gap-2 rounded-[5px] px-1 py-1 hover:bg-surface-2">
                  <span className="flex-1 text-small tabular-nums text-text-1">
                    {formatDateLong(h)}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch({ holidays: cal.holidays.filter((x) => x !== h) })}
                    className="grid size-5 place-items-center rounded-[4px] text-text-3 hover:bg-sched-late-soft hover:text-sched-late"
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <input
            type="date"
            value={newHoliday}
            onChange={(e) => setNewHoliday(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHoliday()}
            className="h-7 flex-1 rounded-[5px] border border-line bg-surface-0 px-1.5 text-micro tabular-nums text-text-1"
          />
          <button
            type="button"
            onClick={addHoliday}
            disabled={!isValidISODate(newHoliday)}
            className="grid size-7 place-items-center rounded-[5px] bg-surface-3 text-text-2 transition-colors hover:text-text-1 disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function uniqueName(calendars, base) {
  if (!calendars.some((c) => c.name === base)) return base;
  let i = 2;
  while (calendars.some((c) => c.name === `${base} ${i}`)) i++;
  return `${base} ${i}`;
}
