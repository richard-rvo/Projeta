import React, { useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  X, Calendar, CalendarClock, Users, Link2, FileText, Trash2,
  AlertTriangle, Indent, Outdent, Target,
} from 'lucide-react';
import {
  formatDateShort, formatDateTimeShort, clampProgress, isMilestone, daysBetween,
  isManual, SCHEDULE_MODES, CONSTRAINT_TYPES, CONSTRAINT_NONE, constraintOf,
} from '../utils/schedule';
import { calculateTaskPlannedProgress } from '../utils/progress';
import { stateOf, viewProgress } from '../utils/taskState';
import {
  calendarOf, calendarsOf, defaultCalendarOf, durationDisplayOf, rebaseTaskCalendar,
} from '../utils/calendar';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, snapBackward,
} from '../utils/worktime';
import { formatDuration, resolveDuration } from '../utils/duration';
import { applyForwardPass, stripComputed } from '../views/gantt/useGanttTasks';
import { analyseSchedule } from '../utils/cpm';
import {
  readDependencies, DEPENDENCY_TYPES, wouldCreateCycle,
} from '../utils/dependencies';

/* ═══════════════════════════════════════════════════════════════
   INSPECTOR — o único caminho de edição de detalhe de tarefa.

   Antes existiam três: célula inline, o Modal do Gantt e este
   drawer. E este era o pior dos três: nunca foi chamado por
   ninguém e escrevia em campos que não existem no modelo
   (`predecessors`, `resource`, `duration`, `isMilestone`, e status
   em snake_case). Se tivesse sido ligado, corromperia as tarefas.

   Agora ele fala o schema real e é a única superfície de detalhe.
   A edição inline na grade continua — ela cobre as colunas; o
   Inspector cobre o resto.

   Gravação por campo, ao confirmar: cada alteração vira uma entrada
   de histórico própria, então ⌘Z desfaz uma coisa de cada vez em
   vez de um bloco inteiro.
   ═══════════════════════════════════════════════════════════════ */

/* Estado não é editável aqui porque não é um campo: estágio é a
   leitura de `progress` e atraso é medido contra hoje. Editar o
   estado É mover o progresso — que é o controle logo abaixo. */
const STAGE_TONE_VARIANT = {
  'not-started': 'neutral',
  'on-track': 'onTrack',
  done: 'done',
};

export default function TaskInspectorDrawer() {
  const {
    state, updateTasksBatch, removeTask, closeTaskInspector, showToast,
  } = useContext(AppContext);

  const { inspectorTaskId, tasks, projects, anomalies } = state;
  const task = tasks.find((t) => t.id === inspectorTaskId);

  const project = projects.find((p) => p.id === task?.projectId);
  const [draft, setDraft] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setDraft(task ? { ...task } : null); }, [task]);

  /* Irmãos do mesmo projeto, na ordem da grade — as predecessoras são
     exibidas por número de linha, como no MS Project. */
  const siblings = useMemo(() => {
    if (!task) return [];
    return tasks
      .filter((t) => t.projectId === task.projectId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [tasks, task]);

  const links = readDependencies(task?.dependsOn);

  /* Candidatas a predecessora: irmãs que ainda não estão ligadas e que
     não fechariam ciclo. Filtrar aqui em vez de validar no clique é o
     que impede o seletor de oferecer uma opção que daria erro. */
  const candidates = useMemo(() => {
    if (!task) return [];
    const already = new Set(readDependencies(task.dependsOn).map((d) => d.id));
    return siblings
      .map((t, i) => ({ task: t, row: i + 1 }))
      .filter(({ task: cand }) =>
        cand.id !== task.id &&
        !already.has(cand.id) &&
        !wouldCreateCycle(cand.id, task.id, siblings)
      );
  }, [task, siblings]);

  const setLinks = useCallback(
    (next) => commit({ dependsOn: next }, 'Alterar predecessoras'),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [task, siblings]
  );

  const commit = useCallback(async (patch, label) => {
    if (!task) return;
    const next = { ...task, ...patch };
    const reschedules = 'startDate' in patch || 'endDate' in patch
      || 'dependsOn' in patch || 'scheduleMode' in patch || 'calendarId' in patch;
    const list = reschedules ? applyForwardPass(next, siblings, project) : [next];
    await updateTasksBatch(list.map(stripComputed), label);
  }, [task, siblings, project, updateTasksBatch]);

  /**
   * Editar o início DESLOCA a tarefa preservando a duração, e fixa o
   * modo manual quando ela tem predecessora — as mesmas duas regras da
   * grade. Gravar só o campo mudaria a duração em vez de mover a
   * tarefa, e sem virar manual o próximo recálculo desfaria a
   * digitação em silêncio.
   */
  const commitStart = useCallback(async (value) => {
    if (!task) return;
    const cal = calendarOf(project, task);
    const duration = workingMinutesBetween(cal, task.startDate, task.endDate);
    const start = snapForward(cal, value);
    if (!start) return;

    const patch = { startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
    const becomesManual = !isManual(task) && readDependencies(task.dependsOn).length > 0;
    if (becomesManual) patch.scheduleMode = SCHEDULE_MODES.MANUAL;

    await commit(patch, 'Alterar início');
    if (becomesManual) {
      showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
    }
  }, [task, project, commit, showToast]);

  /** O término encaixa no calendário e recusa avisando — as mesmas
   *  duas regras da grade. Antes gravava cru: dava para terminar
   *  domingo 03:00 num calendário Seg–Sex. */
  const commitEnd = useCallback(async (value) => {
    if (!task || !value) return;
    if (value <= task.startDate) {
      showToast('O término tem que ser depois do início.', 'error');
      return;
    }
    const cal = calendarOf(project, task);
    await commit({ endDate: snapBackward(cal, value) }, 'Alterar término');
  }, [task, project, commit, showToast]);

  /** Trocar de calendário mantém o início e a duração real em minutos
   *  úteis, exatamente como a edição inline do Gantt. Assim uma tarefa
   *  de 8h não vira 24h só porque passou para um calendário 24 Horas. */
  const commitCalendar = useCallback(async (calendarId) => {
    if (!task) return;
    await commit(rebaseTaskCalendar(project, task, calendarId), 'Alterar calendário');
  }, [task, project, commit]);

  /* Violação e prazo vêm da MESMA análise que o Gantt usa — dois
     cálculos discordariam. */
  const analysis = useMemo(
    () => analyseSchedule(siblings, project),
    [siblings, project]
  );
  const violation = task && isManual(task)
    ? (analysis.byId.get(task.id)?.violationMinutes || 0)
    : 0;
  const deadlineMinutes = task
    ? (analysis.byId.get(task.id)?.deadlineMinutes || 0)
    : 0;
  const constraint = constraintOf(task);

  if (!inspectorTaskId || !draft || !task) return null;

  const linked = anomalies.filter((a) => a.taskId === task.id);
  const calendar = calendarOf(project, task);
  const calendars = calendarsOf(project);
  const durationMinutes = workingMinutesBetween(calendar, task.startDate, task.endDate);
  const durationUnit = durationDisplayOf(project);
  const milestone = isMilestone(task);
  const derived = stateOf(task);
  const planned = calculateTaskPlannedProgress(task.baselineStart, task.baselineEnd);
  const drift = task.baselineEnd && task.endDate ? daysBetween(task.baselineEnd, task.endDate) : null;

  return (
    <>
      <Sheet
        open={Boolean(inspectorTaskId)}
        onOpenChange={(open) => { if (!open) closeTaskInspector(); }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[420px] max-w-full sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Detalhes da tarefa</SheetTitle>
          <SheetDescription className="sr-only">
            Edite o cronograma, progresso, recursos e vínculos da tarefa.
          </SheetDescription>
        {/* ── Cabeçalho ──────────────────────────────────────── */}
        <header className="flex shrink-0 items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-micro text-text-3">
              <span className="truncate">{project?.name}</span>
              {milestone && (
                <Badge variant="secondary">Marco</Badge>
              )}
              {task.isSummary && (
                <Badge variant="secondary">Resumo</Badge>
              )}
            </div>
            <input
              value={draft.name || ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={(e) => e.target.value !== task.name && commit({ name: e.target.value }, 'Renomear tarefa')}
              className={cn(
                'w-full rounded-[6px] bg-transparent px-1.5 py-1 -mx-1.5',
                'text-read font-semibold tracking-tight text-text-1',
                'transition-colors hover:bg-surface-2 focus:bg-surface-2'
              )}
              placeholder="Nome da tarefa"
            />
          </div>
          <Button
            type="button"
            onClick={closeTaskInspector}
            title="Fechar (Esc)"
            variant="ghost"
            size="icon-sm"
            className="mt-1"
          >
            <X />
          </Button>
        </header>

        {/* ── Corpo ──────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <Section
            label="Progresso"
            aside={
              <span className="flex items-center gap-1.5">
                <Badge variant={STAGE_TONE_VARIANT[derived.tone] || 'neutral'}>
                  {derived.label}
                </Badge>
                {derived.late && (
                  <Badge
                    variant="late"
                    title={`${derived.lateDays} dia(s) além do término`}
                  >
                    {derived.lateDays}d atrás
                  </Badge>
                )}
                <span className="text-small font-semibold tabular-nums text-text-1">
                  {viewProgress(task)}%
                </span>
              </span>
            }
          >
            {task.isSummary ? (
              <p className="text-small text-text-3">
                Calculado a partir das subtarefas.
              </p>
            ) : (
              <>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={clampProgress(draft.progress)}
                  onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
                  onMouseUp={() => commit({ progress: clampProgress(draft.progress) }, 'Ajustar progresso')}
                  onKeyUp={() => commit({ progress: clampProgress(draft.progress) }, 'Ajustar progresso')}
                  className="w-full accent-[var(--brand)]"
                />
                <div className="mt-2 flex gap-1.5">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      onClick={() => commit({ progress: pct }, 'Ajustar progresso')}
                      variant={clampProgress(task.progress) === pct ? 'navActive' : 'secondary'}
                      size="xs"
                      className="flex-1"
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>
              </>
            )}
          </Section>

          <Section label="Cronograma" icon={Calendar}>
            {/* Automática segue as predecessoras; manual fica onde o
                planejador colocou, e o Gantt avisa se isso desrespeitar
                a dependência — mas não move nada sozinho. */}
            <Field label="Modo de agendamento">
              <InspectorSelect
                value={isManual(task) ? SCHEDULE_MODES.MANUAL : SCHEDULE_MODES.AUTO}
                disabled={task.isSummary}
                onValueChange={(value) => commit({ scheduleMode: value }, 'Alterar modo de agendamento')}
              >
                <SelectItem value={SCHEDULE_MODES.AUTO}>Automática — segue as predecessoras</SelectItem>
                <SelectItem value={SCHEDULE_MODES.MANUAL}>Manual — datas fixas</SelectItem>
              </InspectorSelect>
            </Field>

            {violation > 0 && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-[6px] bg-sched-late-soft px-2 py-1.5 text-micro text-sched-late">
                <AlertTriangle size={12} className="mt-px shrink-0" />
                <span>
                  Começa {formatDuration(violation, calendar)} antes do que a
                  predecessora permite. Por ser manual, ela não será movida.
                </span>
              </p>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Início">
                <Input
                  type="datetime-local"
                  value={draft.startDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.startDate && commitStart(e.target.value)}
                />
              </Field>
              <Field label="Término">
                <Input
                  type="datetime-local"
                  value={draft.endDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.endDate && commitEnd(e.target.value)}
                />
              </Field>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Duração">
                <Input
                  type="text"
                  defaultValue={formatDuration(durationMinutes, calendar, { unit: durationUnit })}
                  disabled={task.isSummary}
                  placeholder="3d · 4h · 90m"
                  title="Aceita 3d, 4h ou 90m"
                  onBlur={(e) => {
                    /* Duração não é armazenada: ela desloca o término.
                       A leitura é a mesma da grade — antes esta tela
                       somava dias corridos e a grade, dias úteis. */
                    const minutes = resolveDuration(e.target.value, calendar, durationMinutes);
                    if (minutes === null || minutes === durationMinutes) return;
                    commit(
                      { endDate: addWorkingMinutes(calendar, task.startDate, minutes) },
                      'Alterar duração'
                    );
                  }}
                />
              </Field>
              <Field label="Calendário">
                <InspectorSelect
                  value={draft.calendarId || '__project__'}
                  disabled={task.isSummary}
                  onValueChange={(value) => commitCalendar(value === '__project__' ? '' : value)}
                >
                  <SelectItem value="__project__">
                    Do projeto ({defaultCalendarOf(project).name})
                  </SelectItem>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </InspectorSelect>
              </Field>
            </div>
          </Section>

          {/* `constraintStart` era lido pelo motor e escrito por
              ninguém: não havia UI. Quem precisasse prender uma data só
              tinha o modo manual, que é caro — tira a tarefa do
              agendamento automático inteiro. */}
          <Section label="Restrição de data" icon={CalendarClock}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo">
                <InspectorSelect
                  value={draft.constraintType || CONSTRAINT_NONE}
                  disabled={task.isSummary}
                  onValueChange={(type) => {
                    const patch = { constraintType: type };
                    if (type === CONSTRAINT_NONE) patch.constraintDate = undefined;
                    else if (!task.constraintDate) patch.constraintDate = task.startDate;
                    commit(patch, 'Alterar restrição');
                  }}
                >
                  {CONSTRAINT_TYPES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </InspectorSelect>
              </Field>
              <Field label="Data">
                <Input
                  type="datetime-local"
                  value={draft.constraintDate || ''}
                  disabled={task.isSummary || !constraint}
                  onChange={(e) => setDraft({ ...draft, constraintDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.constraintDate
                    && commit({ constraintDate: e.target.value }, 'Alterar data da restrição')}
                />
              </Field>
            </div>
            {constraint && (
              <p className="mt-1.5 text-micro leading-relaxed text-text-3">
                {CONSTRAINT_TYPES.find((c) => c.id === constraint.type)?.hint}
              </p>
            )}
            {deadlineMinutes > 0 && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-[6px] bg-sched-late-soft px-2 py-1.5 text-micro text-sched-late">
                <AlertTriangle size={12} className="mt-px shrink-0" />
                <span>
                  Termina {formatDuration(deadlineMinutes, calendar)} depois do
                  prazo. O cronograma não foi alterado — o prazo é um aviso.
                </span>
              </p>
            )}
          </Section>

          <Section label="Predecessoras" icon={Link2}>
            {links.length === 0 ? (
	              <p className="text-small text-text-3">
	                Nenhuma. Escolha uma tarefa abaixo, ou digite na coluna Pred. do
	                Gantt (ex.: <span className="tabular-nums">2+3; 4II</span>).
	              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {links.map((dep, i) => {
                  const row = siblings.findIndex((t) => t.id === dep.id);
                  const pred = siblings[row];
                  return (
                    <li key={dep.id} className="flex items-center gap-1.5">
                      <span className="w-6 shrink-0 text-right text-micro tabular-nums text-text-3">
                        {row >= 0 ? row + 1 : "?"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-small text-text-1">
                        {pred?.name || "(fora deste projeto)"}
                      </span>
                      <InspectorSelect
                        value={dep.type}
                        onValueChange={(value) => setLinks(links.map((d, j) =>
                          j === i ? { ...d, type: value } : d))}
                        title={DEPENDENCY_TYPES.find((t) => t.id === dep.type)?.hint}
                        className="w-18 shrink-0"
                        size="sm"
                      >
                        {DEPENDENCY_TYPES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.code} · {t.label}
                          </SelectItem>
                        ))}
                      </InspectorSelect>
                      <Input
                        type="number"
                        value={dep.lag}
                        onChange={(e) => setLinks(links.map((d, j) =>
                          j === i ? { ...d, lag: parseInt(e.target.value, 10) || 0 } : d))}
                        title="Defasagem em dias úteis"
                        className="w-14 shrink-0"
                      />
                      <Button
                        type="button"
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                        title="Remover"
                        variant="destructiveGhost"
                        size="icon-xs"
                      >
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Único caminho de criação por apontamento — o arrasto na
                ponta da barra saiu do Gantt. Só entram candidatas que não
                fecham ciclo, então não existe opção que dê erro. */}
            {candidates.length > 0 && (
              <InspectorSelect
                value=""
                onValueChange={(value) => {
                  if (!value) return;
                  setLinks([...links, { id: value, type: 'FS', lag: 0 }]);
                }}
                placeholder="Adicionar predecessora..."
                className="mt-2"
              >
                {candidates.map(({ task: cand, row }) => (
                  <SelectItem key={cand.id} value={cand.id}>
                    {row}. {cand.name}
                  </SelectItem>
                ))}
              </InspectorSelect>
            )}
          </Section>

          <Section label="Recursos" icon={Users}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Equipe">
                <Input
                  value={draft.resources || ''}
                  onChange={(e) => setDraft({ ...draft, resources: e.target.value })}
                  onBlur={(e) => e.target.value !== (task.resources || '') && commit({ resources: e.target.value }, 'Alterar recursos')}
                  placeholder="2 Mecânicos"
                />
              </Field>
              <Field label="Grupo">
                <Input
                  value={draft.resourceGroup || ''}
                  onChange={(e) => setDraft({ ...draft, resourceGroup: e.target.value })}
                  onBlur={(e) => e.target.value !== (task.resourceGroup || '') && commit({ resourceGroup: e.target.value }, 'Alterar grupo')}
                  placeholder="Engenharia"
                />
              </Field>
            </div>
          </Section>

          <Section label="Hierarquia" icon={Indent}>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => commit({ indentLevel: Math.max(0, (task.indentLevel || 0) - 1) }, 'Alterar hierarquia')}
                disabled={(task.indentLevel || 0) === 0}
                variant="outline"
                size="sm"
              >
                <Outdent data-icon="inline-start" /> Recuar
              </Button>
              <Button
                type="button"
                onClick={() => commit({ indentLevel: (task.indentLevel || 0) + 1 }, 'Alterar hierarquia')}
                variant="outline"
                size="sm"
              >
                <Indent data-icon="inline-start" /> Avançar
              </Button>
              <span className="ml-auto text-micro tabular-nums text-text-3">
                Nível {task.indentLevel || 0}
              </span>
            </div>
          </Section>

          {(task.baselineStart || task.baselineEnd) && (
            <Section label="Linha de base" icon={Target}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
                <dt className="text-text-3">Planejado</dt>
                <dd className="text-right tabular-nums text-text-1">
                  {formatDateTimeShort(task.baselineStart)} → {formatDateTimeShort(task.baselineEnd)}
                </dd>
                <dt className="text-text-3">% planejada hoje</dt>
                <dd className="text-right tabular-nums text-text-1">{planned}%</dd>
                {drift !== null && (
                  <>
                    <dt className="text-text-3">Desvio</dt>
                    <dd className={cn(
                      'text-right font-medium tabular-nums',
                      drift > 0 ? 'text-sched-late' : drift < 0 ? 'text-sched-done' : 'text-text-1'
                    )}>
                      {drift > 0 ? `+${drift}d` : `${drift}d`}
                    </dd>
                  </>
                )}
              </dl>
            </Section>
          )}

          <Section label="Observações" icon={FileText}>
            <Textarea
              rows={3}
              value={draft.notes || ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              onBlur={(e) => e.target.value !== (task.notes || '') && commit({ notes: e.target.value }, 'Alterar observações')}
              placeholder="Contexto, riscos, decisões…"
            />
          </Section>

          {linked.length > 0 && (
            <Section label={`Anomalias vinculadas (${linked.length})`} icon={AlertTriangle}>
              <ul className="flex flex-col gap-1.5">
                {linked.map((a) => (
                  <li key={a.id} className="rounded-[6px] border border-line bg-surface-2 px-2.5 py-2">
                    <div className="truncate text-small font-medium text-text-1">{a.title}</div>
                    <div className="mt-0.5 flex gap-2 text-micro text-text-3">
                      <span>{a.severity}</span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ── Rodapé ─────────────────────────────────────────── */}
        <footer className="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
          <Button
            type="button"
            onClick={() => setConfirmDelete(true)}
            variant="destructiveGhost"
            size="sm"
          >
            <Trash2 data-icon="inline-start" /> Excluir
          </Button>
          <span className="text-micro text-text-3">Alterações salvas automaticamente</span>
        </footer>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await removeTask(task.id);
          showToast('Tarefa excluída', 'info');
          setConfirmDelete(false);
          closeTaskInspector();
        }}
        title="Excluir tarefa"
        message={`Excluir "${task.name}"? Use ⌘Z para desfazer.`}
      />
    </>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

function InspectorSelect({
  children, className, placeholder, size = 'default', title, ...props
}) {
  return (
    <Select {...props}>
      <SelectTrigger size={size} title={title} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>{children}</SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Section({ label, icon: Icon, aside, children }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon size={13} strokeWidth={1.8} className="text-text-3" />}
        <h3 className="text-micro font-semibold uppercase tracking-wide text-text-3">{label}</h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className, children }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-micro text-text-3">{label}</span>
      {children}
    </label>
  );
}
