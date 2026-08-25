import { dateOf, addDays } from './schedule';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, snapBackward,
  minutesPerDay, isWorkingDay as isWorkingDayOf, startOfWorkingDay,
  endOfWorkingDay,
} from './worktime';

/* ═══════════════════════════════════════════════════════════════
   CALENDÁRIOS DE TRABALHO
   ═══════════════════════════════════════════════════════════════

   Duas mudanças em relação ao modelo anterior.

   1. O calendário ganhou JORNADA. Antes era só `{ workdays, holidays }`
      — dias inteiros, sem hora — e por isso o cronograma não conseguia
      dizer que uma tarefa começa 13:00 e termina 17:00.

   2. O calendário deixou de ser um por projeto e virou uma BIBLIOTECA
      por projeto, com atribuição por tarefa, como as base calendars do
      MS Project. Numa parada de manutenção a equipe administrativa
      roda 8h/dia e o turno de campo roda 24h; com um calendário só,
      qualquer soma entre as duas estava errada.

   A tarefa aponta um calendário por `calendarId`. Vazio herda o padrão
   do projeto — é o caso da esmagadora maioria das tarefas, e é o que
   evita ter de tocar em cronograma antigo para ele continuar certo.

   A aritmética não mora aqui: mora em utils/worktime.js. Este módulo
   resolve QUAL calendário vale e mantém compatibilidade com o formato
   antigo, que ainda chega por backup importado.
   ═══════════════════════════════════════════════════════════════ */

/* ── Presets ───────────────────────────────────────────────────────
   Ponto de partida do editor de calendários. Turno da noite atravessa
   a meia-noite, o que um turno único não representa: fica como dois
   trechos do mesmo dia (00:00–06:00 e 22:00–24:00), somando as mesmas
   8 horas e mantendo cada turno dentro de um dia. */

export const CALENDAR_PRESETS = [
  {
    id: 'padrao',
    name: 'Padrão',
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ from: '08:00', to: '12:00' }, { from: '13:00', to: '17:00' }],
    holidays: [],
  },
  {
    id: '24h',
    name: '24 Horas',
    workdays: [0, 1, 2, 3, 4, 5, 6],
    shifts: [{ from: '00:00', to: '24:00' }],
    holidays: [],
  },
  {
    id: 'noturno',
    name: 'Turno Noturno',
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ from: '00:00', to: '06:00' }, { from: '22:00', to: '24:00' }],
    holidays: [],
  },
  {
    id: 'seis-por-um',
    name: 'Seis por Um',
    workdays: [1, 2, 3, 4, 5, 6],
    shifts: [{ from: '07:00', to: '13:00' }],
    holidays: [],
  },
];

/** Seg–Sex, 08:00–12:00 e 13:00–17:00. */
export const DEFAULT_CALENDAR = CALENDAR_PRESETS[0];

export const DEFAULT_CALENDAR_ID = DEFAULT_CALENDAR.id;

export const DURATION_DISPLAY_OPTIONS = [
  { id: 'auto', label: 'Automático', description: 'Horas abaixo de um dia e dias acima dele' },
  { id: 'hours', label: 'Sempre em horas', description: 'Mantém a duração visível em horas' },
  { id: 'days', label: 'Sempre em dias', description: 'Exibe a duração usando a jornada do calendário' },
];

export function durationDisplayOf(project) {
  const value = project?.calendarSettings?.durationDisplay;
  return DURATION_DISPLAY_OPTIONS.some((option) => option.id === value) ? value : 'auto';
}

/* ── Forma ─────────────────────────────────────────────────────── */

/**
 * Completa os campos que faltam sem inventar jornada: um calendário
 * sem `shifts` veio do formato antigo, onde o dia útil era o dia
 * inteiro sem hora nenhuma. Herdar a jornada Padrão nesse caso é o
 * comportamento certo — é o que o usuário via como "um dia de
 * trabalho" antes de existir hora.
 */
export function normalizeCalendar(cal, fallback = DEFAULT_CALENDAR) {
  const source = cal || fallback;
  return {
    id: source.id || fallback.id,
    name: source.name || fallback.name,
    workdays: Array.isArray(source.workdays) && source.workdays.length
      ? source.workdays
      : fallback.workdays,
    shifts: Array.isArray(source.shifts) && source.shifts.length
      ? source.shifts
      : fallback.shifts,
    holidays: Array.isArray(source.holidays) ? source.holidays : [],
  };
}

/**
 * Biblioteca de calendários do projeto.
 *
 * Tolera as três formas que podem chegar: a nova (`calendars`), a
 * antiga (`calendar` de dia inteiro, que vira o "Padrão" do projeto
 * preservando dias úteis e feriados) e a ausência das duas.
 */
export function calendarsOf(project) {
  const list = project?.calendars;
  if (Array.isArray(list) && list.length) {
    return list.map((c) => normalizeCalendar(c));
  }
  if (project?.calendar) {
    return [normalizeCalendar({ ...project.calendar, id: DEFAULT_CALENDAR_ID, name: DEFAULT_CALENDAR.name })];
  }
  return [DEFAULT_CALENDAR];
}

/** Calendário padrão do projeto — o que a tarefa herda. */
export function defaultCalendarOf(project) {
  const list = calendarsOf(project);
  return list.find((c) => c.id === project?.defaultCalendarId) || list[0];
}

/** Busca por id dentro da biblioteca; cai no padrão se o id sumiu. */
export function resolveCalendar(project, calendarId) {
  if (!calendarId) return defaultCalendarOf(project);
  return calendarsOf(project).find((c) => c.id === calendarId) || defaultCalendarOf(project);
}

/**
 * O calendário que vale para uma tarefa: o dela, senão o padrão do
 * projeto. Chamado sem tarefa, devolve o padrão — é como a maior parte
 * do código que só conhece o projeto continua funcionando.
 */
export function calendarOf(project, task) {
  return resolveCalendar(project, task?.calendarId);
}

/**
 * Quantas tarefas têm uma escolha explícita por este calendário.
 *
 * A ausência de `calendarId` significa herança do padrão do projeto,
 * portanto não entra na conta. Mantemos essa referência íntegra em vez
 * de deixar uma tarefa apontar para um calendário que já não existe.
 */
export function calendarAssignmentCount(tasks, calendarId) {
  if (!calendarId || !Array.isArray(tasks)) return 0;
  return tasks.reduce(
    (count, task) => count + (task?.calendarId === calendarId ? 1 : 0),
    0,
  );
}

/**
 * Aplica outro calendário a uma tarefa sem alterar sua duração efetiva.
 * Centralizar esta regra evita que o inspetor e a grade interpretem a
 * mesma troca de forma diferente.
 */
export function rebaseTaskCalendar(project, task, calendarId) {
  const currentCalendar = calendarOf(project, task);
  const nextCalendar = resolveCalendar(project, calendarId);
  const duration = workingMinutesBetween(currentCalendar, task.startDate, task.endDate);
  const start = snapForward(nextCalendar, task.startDate);

  return {
    ...task,
    calendarId: calendarId || undefined,
    startDate: start,
    endDate: addWorkingMinutes(nextCalendar, start, duration),
  };
}

/* ── Atalhos de dia ────────────────────────────────────────────────
   Camada fina sobre worktime, para quem raciocina em dia: o cabeçalho
   da timeline, o sombreado de não-útil e o editor de feriados. */

export function isWorkingDay(cal, date) {
  return isWorkingDayOf(cal, dateOf(date));
}

/** Primeiro dia útil em `date` ou depois. */
export function nextWorkingDay(cal, date) {
  const dt = snapForward(cal, dateOf(date));
  return dateOf(dt) || dateOf(date);
}

/** Último dia útil em `date` ou antes. */
export function previousWorkingDay(cal, date) {
  const dt = snapBackward(cal, `${dateOf(date)}T23:59`);
  return dateOf(dt) || dateOf(date);
}

/** Abertura do dia como instante — para uma data-só virar início. */
export function workdayStart(cal, date) {
  return startOfWorkingDay(cal, dateOf(date)) || snapForward(cal, dateOf(date));
}

/** Fechamento do dia como instante — para uma data-só virar término. */
export function workdayEnd(cal, date) {
  return endOfWorkingDay(cal, dateOf(date)) || snapBackward(cal, `${dateOf(date)}T23:59`);
}

/**
 * Duração em DIAS úteis do calendário, fracionária.
 * Um dia é `minutesPerDay` daquele calendário — 8h no Padrão, 24h no
 * 24 Horas. É por isso que a mesma tarefa de "3 dias" não dura o mesmo
 * tempo de relógio em calendários diferentes.
 */
export function workingDays(cal, start, finish) {
  return workingMinutesBetween(cal, start, finish) / minutesPerDay(cal);
}

/** Término que dá exatamente `days` dias úteis a partir de `start`. */
export function finishFromWorkingDays(cal, start, days) {
  return addWorkingMinutes(cal, start, days * minutesPerDay(cal));
}

/** Desloca N dias úteis, preservando a hora dentro da jornada. */
export function shiftWorkingDays(cal, dt, n) {
  return addWorkingMinutes(cal, dt, n * minutesPerDay(cal));
}

/** Feriados dentro da janela — usada para sombrear a timeline. */
export function holidaysBetween(cal, from, to) {
  const start = dateOf(from);
  const end = dateOf(to);
  return (cal?.holidays || []).filter((h) => h >= start && h <= end);
}

/** Dias não úteis da janela — fim de semana E feriado, do calendário. */
export function nonWorkingDaysBetween(cal, from, to) {
  const out = [];
  let cursor = dateOf(from);
  const end = dateOf(to);
  for (let i = 0; i < 4000 && cursor <= end; i++) {
    if (!isWorkingDayOf(cal, cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Valida uma data ISO digitada pelo usuário no editor de feriados. */
export function isValidISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Valida 'HH:mm' digitado no editor de turnos. */
export function isValidTime(value) {
  const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) return false;
  return match[1] !== '24' || match[2] === '00';
}
