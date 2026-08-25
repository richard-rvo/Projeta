import { describe, expect, it } from 'vitest';
import {
  calendarAssignmentCount, CALENDAR_PRESETS, DEFAULT_CALENDAR, isValidTime, rebaseTaskCalendar,
} from './calendar';

describe('calendar time validation', () => {
  it('aceita horários de turno e o fechamento 24:00', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('08:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(true);
  });

  it('rejeita horários incompletos e valores após 24:00', () => {
    expect(isValidTime('8:30')).toBe(false);
    expect(isValidTime('24:01')).toBe(false);
    expect(isValidTime('24:30')).toBe(false);
    expect(isValidTime('25:00')).toBe(false);
  });
});

describe('calendar assignments', () => {
  it('conta apenas tarefas que escolheram explicitamente o calendário', () => {
    const tasks = [
      { id: 'a' },
      { id: 'b', calendarId: 'campo' },
      { id: 'c', calendarId: 'campo' },
      { id: 'd', calendarId: 'administrativo' },
    ];

    expect(calendarAssignmentCount(tasks, 'campo')).toBe(2);
    expect(calendarAssignmentCount(tasks, 'administrativo')).toBe(1);
    expect(calendarAssignmentCount(tasks, 'inexistente')).toBe(0);
  });

  it('mantém a duração em minutos úteis ao trocar o calendário da tarefa', () => {
    const allDay = CALENDAR_PRESETS.find((calendar) => calendar.id === '24h');
    const project = {
      calendars: [DEFAULT_CALENDAR, allDay],
      defaultCalendarId: DEFAULT_CALENDAR.id,
    };
    const task = {
      id: 'campo',
      startDate: '2026-08-10T08:00',
      endDate: '2026-08-10T17:00',
    };

    expect(rebaseTaskCalendar(project, task, '24h')).toMatchObject({
      calendarId: '24h',
      startDate: '2026-08-10T08:00',
      endDate: '2026-08-10T16:00',
    });
  });
});
