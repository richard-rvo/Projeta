import { defaultCalendarOf, workdayStart } from './calendar';
import { addWorkingMinutes, minutesPerDay } from './worktime';
import { SCHEDULE_MODES, today } from './schedule';
import { generateId } from './ids';

/* Fábrica única de tarefa nova. Gantt, Quadro e Atas precisam concordar
   no formato: nasce no início da próxima jornada do calendário padrão do
   projeto, em modo automático, com `workingDays` dias úteis de duração. */
export function buildNewTask(project, { name, order, startDay, workingDays = 5 }) {
  const cal = defaultCalendarOf(project);
  const startDate = workdayStart(cal, startDay ?? today());
  return {
    id: generateId(),
    projectId: project.id,
    name,
    startDate,
    endDate: addWorkingMinutes(cal, startDate, workingDays * minutesPerDay(cal)),
    scheduleMode: SCHEDULE_MODES.AUTO,
    progress: 0,
    dependsOn: [],
    indentLevel: 0,
    order,
  };
}
