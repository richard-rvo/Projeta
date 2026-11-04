import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { buildNewTask } from '../utils/taskFactory';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarButton } from '../components/shell/ViewBar';
import { Plus, Columns3, CalendarDays, Users } from 'lucide-react';
import {
  STAGES, stageOf, isLate, lateDays, progressForStage, viewProgress, leaves,
} from '../utils/taskState';
import { formatDateShort } from '../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   QUADRO

   Uma coluna por ESTÁGIO, com contador e marca de atraso.

   A coluna "Atrasada" saiu. Atraso é uma condição medida contra a
   data de hoje, não um estágio de trabalho: arrastar um card para lá
   não mudava data nenhuma, só carimbava uma opinião que o resto do
   app ignorava. Agora o atraso aparece como MARCA no card e no
   contador da coluna, e o card continua no estágio em que está — que
   é como "em andamento e atrasada" fica legível.

   Arrastar entre colunas move o PROGRESSO, que é o dado real; o
   estágio é a leitura dele.
   ═══════════════════════════════════════════════════════════════ */

const COLUMN_TONE = {
  'not-started': 'bg-sched-not-started',
  'in-progress': 'bg-sched-on-track',
  done: 'bg-sched-done',
};

export default function PageKanban() {
  const { state, addTask, updateTasksBatch, openTaskInspector } = useContext(AppContext);
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const projectId = state.activeProjectId;
  /* Só folhas: um card "Execução" que é o cabeçalho de seis tarefas
     não é uma coisa que alguém arrasta entre colunas. */
  const tasks = useMemo(
    () => leaves(state.tasks.filter((t) => t.projectId === projectId)),
    [state.tasks, projectId]
  );

  const byStage = useMemo(() => {
    const map = new Map(STAGES.map((s) => [s.id, []]));
    tasks.forEach((t) => map.get(stageOf(t)).push(t));
    return map;
  }, [tasks]);

  const lateTotal = useMemo(() => tasks.filter((t) => isLate(t)).length, [tasks]);

  const drop = async (stageId) => {
    setOverColumn(null);
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || stageOf(task) === stageId) return;

    /* O estágio é derivado do progresso, então mover de coluna é
       escrever progresso. Não existe mais como um card ficar em
       "Concluída" com 40%: a contradição virou impossível. */
    await updateTasksBatch(
      [{ ...task, progress: progressForStage(stageId, task.progress) }],
      'Mover no quadro'
    );
  };

  const addTo = async (stageId) => {
    /* Nasce com jornada e no calendário padrão do projeto — as três
       telas que criam tarefa precisam concordar no formato. */
    const project = state.projects.find((p) => p.id === projectId);
    const task = {
      ...buildNewTask(project, { name: 'Nova tarefa', order: tasks.length }),
      progress: progressForStage(stageId, 0),
    };
    await addTask(task);
    openTaskInspector(task.id);
  };

  if (!state.projects.find((p) => p.id === projectId)) return null;

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <Columns3 size={14} strokeWidth={1.8} className="text-text-3" />
        <span className="text-small text-text-2">
          {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} em {STAGES.length} colunas
        </span>
        {lateTotal > 0 && (
          <span className="rounded-full bg-sched-late-soft px-2 py-0.5 text-micro font-semibold tabular-nums text-sched-late">
            {lateTotal} atrasada{lateTotal !== 1 ? 's' : ''}
          </span>
        )}
      </ViewBar>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex h-full min-h-0 gap-3">
          {STAGES.map((stage) => {
            const items = byStage.get(stage.id) || [];
            const lateHere = items.filter((t) => isLate(t)).length;
            return (
              <section
                key={stage.id}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(stage.id); }}
                onDragLeave={() => setOverColumn((c) => (c === stage.id ? null : c))}
                onDrop={() => drop(stage.id)}
                className={cn(
                  'flex min-w-64 flex-1 flex-col rounded-[10px] border bg-surface-2 transition-colors',
                  overColumn === stage.id
                    ? 'border-brand bg-brand-soft'
                    : 'border-line'
                )}
              >
                <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                  <span className={cn('size-2 rounded-full', COLUMN_TONE[stage.id])} />
                  <h2 className="text-body font-semibold text-text-1">{stage.label}</h2>
                  <span className="rounded-full bg-surface-1 px-1.5 text-micro font-semibold tabular-nums text-text-3">
                    {items.length}
                  </span>
                  {/* Atraso não é coluna: é uma marca sobre o estágio. */}
                  {lateHere > 0 && (
                    <span
                      title={`${lateHere} atrasada(s) nesta coluna`}
                      className="rounded-full bg-sched-late-soft px-1.5 text-micro font-semibold tabular-nums text-sched-late"
                    >
                      {lateHere}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => addTo(stage.id)}
                    title={`Nova tarefa em ${stage.label}`}
                    className="ml-auto grid size-6 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-surface-1 hover:text-text-1"
                  >
                    <Plus size={14} />
                  </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-micro text-text-3">
                      Arraste tarefas para cá
                    </p>
                  ) : (
                    items.map((task) => (
                      <Card
                        key={task.id}
                        task={task}
                        dragging={dragId === task.id}
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                        onOpen={() => openTaskInspector(task.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({ task, dragging, onDragStart, onDragEnd, onOpen }) {
  const progress = viewProgress(task);
  const overdue = isLate(task);
  const behind = overdue ? lateDays(task) : 0;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'cursor-pointer rounded-[8px] border border-line bg-surface-1 p-2.5',
        'transition-all hover:border-line-strong hover:shadow-elev-2',
        dragging && 'opacity-40'
      )}
    >
      <h3 className="line-clamp-2 text-small font-medium leading-snug text-text-1">
        {task.name}
      </h3>

      {task.resources && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-micro text-text-3">
          <Users size={11} strokeWidth={1.8} /> {task.resources}
        </p>
      )}

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full', COLUMN_TONE[stageOf(task)])}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-micro">
        <span className="tabular-nums text-text-3">{progress}%</span>
        {task.endDate && (
          <span className={cn(
            'flex items-center gap-1 tabular-nums',
            overdue ? 'font-semibold text-sched-late' : 'text-text-3'
          )}>
            <CalendarDays size={10} strokeWidth={1.8} />
            {overdue ? `${behind}d atrás` : formatDateShort(task.endDate)}
          </span>
        )}
      </div>
    </article>
  );
}
