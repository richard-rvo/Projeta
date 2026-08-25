import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import MiniTimeline from '../components/MiniTimeline';
import CurveChart from '../components/CurveChart';
import { calculateProjectMetrics } from '../utils/progress';
import { computeSCurve } from '../utils/scurve';
import { today, addDays, dateOf, formatDateLong, durationDays, isMilestone } from '../utils/schedule';
import {
  countByStage, stageOf, isLate, viewProgress, projectSpan, leaves,
} from '../utils/taskState';
import { Calendar, Clock, AlertTriangle, ChevronRight, Flag } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   VISÃO GERAL — o estado do projeto em uma tela

   A fileira de cinco KPI cards com ícone colorido em círculo virou
   uma faixa de números e uma grade de 12 colunas.

   A coluna larga responde "como está o cronograma?" mostrando a
   FORMA dele: a janela dos próximos 30 dias e a curva S. A coluna
   estreita responde "o que exige atenção?".

   Cinco cards idênticos não tinham hierarquia — tudo gritava no
   mesmo volume e nada respondia a pergunta nenhuma.
   ═══════════════════════════════════════════════════════════════ */

const HORIZON_DAYS = 30;

const STAGE_TONE = {
  'not-started': 'neutral',
  'in-progress': 'on-track',
  done: 'done',
};

const SEVERITY_TONE = {
  baixa: 'bg-sched-on-track-soft text-sched-on-track',
  média: 'bg-sched-at-risk-soft text-sched-at-risk',
  alta: 'bg-sched-late-soft text-sched-late',
  crítica: 'bg-sched-critical-soft text-sched-critical',
};

export default function PageProjectOverview() {
  const { state, setProjectTab, openTaskInspector } = useContext(AppContext);

  const project = state.projects.find((p) => p.id === state.activeProjectId);
  const tasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === state.activeProjectId),
    [state.tasks, state.activeProjectId]
  );
  const anomalies = useMemo(
    () => state.anomalies.filter((a) => a.projectId === state.activeProjectId),
    [state.anomalies, state.activeProjectId]
  );
  const curve = useMemo(() => computeSCurve(tasks, 40), [tasks]);

  if (!project) return null;

  const todayStr = today();
  const horizonEnd = addDays(todayStr, HORIZON_DAYS);
  const metrics = calculateProjectMetrics(tasks);

  /* Resumo não é entrega: é o cabeçalho do bloco. Fora das listas. */
  const leafTasks = leaves(tasks);
  const counts = countByStage(tasks, todayStr);
  const done = counts.done;
  const late = counts.late;
  const span = projectSpan(tasks);
  const openAnomalies = anomalies.filter((a) => a.status === 'aberta').length;

  /* Janela de 30 dias: o que está em curso ou começa em breve. */
  const inHorizon = leafTasks
    /* dateOf nos dois lados: 'T08:00' é maior que a data-só do mesmo
       dia, e sem isso a tarefa que começa no último dia da janela
       ficava de fora. */
    .filter((t) => t.startDate && t.endDate
      && dateOf(t.startDate) <= horizonEnd && dateOf(t.endDate) >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 12)
    .map((t) => ({
      id: t.id,
      label: t.name,
      start: t.startDate,
      end: t.endDate,
      progress: t.progress || 0,
      tone: isLate(t) ? 'late' : STAGE_TONE[stageOf(t)],
      milestone: isMilestone(t),
    }));

  const upcoming = leafTasks
    .filter((t) => t.endDate && dateOf(t.endDate) >= todayStr && viewProgress(t) < 100)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 6);

  const milestones = leafTasks
    .filter((t) => isMilestone(t) && dateOf(t.startDate) >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);

  const recentAnomalies = [...anomalies]
    .sort((a, b) => String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-stretch gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        <Metric label="Progresso real" value={`${metrics.progress}%`} />
        {/* Sem linha de base não existe planejado, e inventar um
            número aqui era o que fazia a saúde do projeto mentir. */}
        {metrics.hasBaseline ? (
          <Metric
            label={metrics.deviation >= 0 ? 'Adiantado' : 'Atrasado'}
            value={`${metrics.deviation > 0 ? '+' : ''}${metrics.deviation}%`}
            tone={metrics.deviation >= 0 ? 'done' : 'late'}
          />
        ) : (
          <Metric label="Desvio" value="Sem base" hint="Grave uma linha de base no Gantt" />
        )}
        <Metric label="Tarefas concluídas" value={`${done}/${counts.total}`} />
        <Metric label="Tarefas atrasadas" value={late} tone={late > 0 ? 'late' : null} />
        <Metric label="Anomalias abertas" value={openAnomalies} tone={openAnomalies > 0 ? 'at-risk' : null} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8">
          <Card
            title="Estado do cronograma"
            hint={`Próximos ${HORIZON_DAYS} dias`}
            action={{ label: 'Abrir Gantt', onClick: () => setProjectTab('gantt') }}
          >
            {inHorizon.length ? (
              <MiniTimeline
                items={inHorizon}
                rangeStart={todayStr}
                rangeEnd={horizonEnd}
                labelWidth="clamp(260px, 34%, 380px)"
                rowHeight={32}
                onSelect={(item) => openTaskInspector(item.id)}
              />
            ) : (
              <Empty>Nenhuma tarefa em curso ou prevista para os próximos {HORIZON_DAYS} dias.</Empty>
            )}
          </Card>

          <Card
            title="Curva S"
            hint="Planejado vs realizado"
            action={{ label: 'Ver completa', onClick: () => setProjectTab('scurve') }}
          >
            <CurveChart curve={curve} height={200} />
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card
            title="Próximas entregas"
            icon={Clock}
            action={{ label: 'Abrir Gantt', onClick: () => setProjectTab('gantt') }}
          >
            {upcoming.length ? (
              <ul className="flex flex-col">
                {upcoming.map((t) => {
                  const daysLeft = durationDays(todayStr, t.endDate) - 1;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openTaskInspector(t.id)}
                        className="flex w-full items-center gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-small text-text-1">{t.name}</span>
                        <span
                          className={cn(
                            'shrink-0 text-micro tabular-nums',
                            daysLeft <= 2 ? 'font-semibold text-sched-late' : 'text-text-3'
                          )}
                        >
                          {daysLeft <= 0 ? 'hoje' : `${daysLeft}d`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Nada pendente à frente.</Empty>
            )}
          </Card>

          {milestones.length > 0 && (
            <Card title="Próximos marcos" icon={Flag}>
              <ul className="flex flex-col gap-1.5">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rotate-45 rounded-[1px] bg-text-1" />
                    <span className="min-w-0 flex-1 truncate text-small text-text-1">{m.name}</span>
                    <span className="shrink-0 text-micro tabular-nums text-text-3">
                      {formatDateLong(m.startDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Anomalias"
            icon={AlertTriangle}
            action={{ label: 'Ver todas', onClick: () => setProjectTab('anomalies') }}
          >
            {recentAnomalies.length ? (
              <ul className="flex flex-col gap-1.5">
                {recentAnomalies.map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-px shrink-0 rounded-full px-1.5 py-0.5 text-micro font-medium',
                        SEVERITY_TONE[a.severity] || 'bg-surface-3 text-text-2'
                      )}
                    >
                      {a.severity}
                    </span>
                    <span className="min-w-0 flex-1 text-small leading-snug text-text-1">{a.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma anomalia registrada.</Empty>
            )}
          </Card>

          <Card title="Período" icon={Calendar}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
              {/* Real = as tarefas. Meta = o que foi declarado na
                  criação do projeto e nunca mais tocado — antes só a
                  meta aparecia, e contradizia o Gantt em silêncio. */}
              <dt className="text-text-3">Início real</dt>
              <dd className="text-right tabular-nums text-text-1">{formatDateLong(span.start)}</dd>
              <dt className="text-text-3">Término real</dt>
              <dd className="text-right tabular-nums text-text-1">{formatDateLong(span.end)}</dd>
              {(project.startDate || project.endDate) && (
                <>
                  <dt className="text-text-3">Meta</dt>
                  <dd className="text-right tabular-nums text-text-2">
                    {formatDateLong(project.startDate)} → {formatDateLong(project.endDate)}
                  </dd>
                </>
              )}
              <dt className="text-text-3">Status</dt>
              <dd className="text-right text-text-1">{project.status || 'Planejado'}</dd>
            </dl>
            {project.description && (
              <p className="mt-3 border-t border-line pt-3 text-small leading-relaxed text-text-2">
                {project.description}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

function Metric({ label, value, tone, hint }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-0.5 bg-surface-1 px-4 py-3" title={hint}>
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">{label}</span>
      <span
        className={cn(
          'text-[24px] font-semibold leading-none tracking-tight tabular-nums',
          tone === 'late' ? 'text-sched-late'
            : tone === 'at-risk' ? 'text-sched-at-risk'
              : tone === 'done' ? 'text-sched-done'
                : 'text-text-1'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Card({ title, hint, icon: Icon, action, children }) {
  return (
    <section className="rounded-[10px] border border-line bg-surface-1 p-4">
      <header className="mb-3 flex items-center gap-2">
        {Icon && <Icon size={14} strokeWidth={1.8} className="text-text-3" />}
        <h2 className="text-body font-semibold tracking-tight text-text-1">{title}</h2>
        {hint && <span className="text-micro text-text-3">· {hint}</span>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto flex items-center gap-0.5 rounded-[5px] px-1.5 py-0.5 text-micro font-medium text-text-2 transition-colors hover:bg-surface-3 hover:text-text-1"
          >
            {action.label}
            <ChevronRight size={12} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="py-4 text-center text-small text-text-3">{children}</p>;
}
