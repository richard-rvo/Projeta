import React, {
  useContext, useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { AppContext } from '../../context/AppContext';
import ViewBar, {
  ViewBarButton, ViewBarSegments,
} from '../../components/shell/ViewBar';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from '../../components/ConfirmDialog';
import * as XLSX from 'xlsx';
import {
  AlertCircle, Download, FileText, FolderTree, Link2, Link2Off, Plus, Target,
  Undo2, Redo2, Maximize2,
} from 'lucide-react';

import {
  addDays, daysBetween, durationDays, today, dateOf, formatDateShort,
  formatDateTimeShort, clampProgress, isManual, SCHEDULE_MODES, CONSTRAINT_NONE,
} from '../../utils/schedule';
import {
  calendarOf, calendarsOf, defaultCalendarOf, durationDisplayOf, rebaseTaskCalendar, workdayStart, workdayEnd,
} from '../../utils/calendar';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, snapBackward, minutesPerDay,
} from '../../utils/worktime';
import { formatDuration, resolveDuration } from '../../utils/duration';
import { generateId } from '../../utils/ids';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import {
  ZOOM_LEVELS, COLUMNS,
  DEFAULT_GRID_W, MIN_GRID_W, MAX_GRID_W,
  ROW_H, HEADER_H,
  MIN_DAY_W, MAX_DAY_W, tickForDayWidth, nearestZoomId,
  loadColumnLayout, saveColumnLayout, MIN_COL_W, MAX_COL_W,
  SUBDAY_MIN_DAY_W, DRAG_SNAP_MINUTES, STAGE_MODIFIER,
  GANTT_DENSITIES, DEFAULT_GANTT_DENSITY, ganttDensityById,
} from './ganttConfig';
import {
  useProjectTasks, useAutoScheduling, useScheduleAnalysis,
  viewStart, viewEnd, viewProgress, stripComputed,
} from './useGanttTasks';
import {
  readDependencies, parseDependencyInput, formatDependency, wouldCreateCycle,
} from '../../utils/dependencies';
import { GANTT_MIN_SPAN_DAYS, useGanttLayout } from './useGanttLayout';
import { useGanttKeyboard } from './useGanttKeyboard';
import {
  useScrollViewport, useVirtualRows, useVirtualDays, useZoomOnWheel,
} from './useGanttViewport';
import GanttHeader from './GanttHeader';
import GanttRow from './GanttRow';
import GanttDependencies from './GanttDependencies';
import GanttTooltip from './GanttTooltip';
import GanttContextMenu from './GanttContextMenu';
import GanttCalendarMenu from './GanttCalendarMenu';
import GanttFilterMenu from './GanttFilterMenu';
import GanttColumnMenu from './GanttColumnMenu';
import GanttGroupRow from './GanttGroupRow';
import GanttMinimap from './GanttMinimap';
import { useGanttRows, EMPTY_FILTERS } from './useGanttFilters';

const EMPTY_SET = new Set();
const PRINT_TIMELINE_TARGET_W = {
  landscape: 560,
  portrait: 300,
};
const PRINT_TABLE_W = {
  landscape: 480,
  portrait: 420,
};
const PRINT_MIN_DAY_W = 3.5;
const PRINT_MAX_DAY_W = 24;
const PRINT_MIN_SPAN_DAYS = 14;
const PRINT_PAD_BEFORE = 2;
const PRINT_PAD_AFTER = 5;
const MIN_VISIBLE_TIMELINE_PAD_DAYS = 14;
const SLOW_EDIT_CLICK_DELAY_MS = 450;
const DOUBLE_CLICK_GUARD_MS = 260;
const DENSITY_KEY = 'projeta_gantt_density';
const PROJECT_SUMMARY_KEY = 'projeta_gantt_project_summary';
const PROJECT_SUMMARY_ID = '__project-summary__';

function isPastedMetadataCell(value) {
  return (
    /^\d+$/.test(value) ||
    /^\d+(?:[,.]\d+)?%$/.test(value) ||
    /^\d+(?:[,.]\d+)?\s*[dhm]$/i.test(value) ||
    /^\d+\s*(?:TI|II|TT|IT|FS|SS|FF|SF)(?:\s*[+-]\s*\d+(?:[,.]\d+)?\s*[dhm]?)?$/i.test(value) ||
    /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/.test(value) ||
    /^\d{4}-\d{2}-\d{2}/.test(value)
  );
}

function cleanPastedTaskName(line) {
  const cells = line.split('\t').map((cell) => cell.trim()).filter(Boolean);
  const value = cells.length > 1
    ? cells.find((cell) => !isPastedMetadataCell(cell)) || cells[0]
    : line.trim();
  return value.replace(/^(?:[-*]|\d+[.)])\s+/, '').trim();
}

function taskNamesFromPaste(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(cleanPastedTaskName)
    .filter(Boolean);
}

function buildProjectSummaryTask(project, tasks, calendarFor) {
  const source = tasks.filter((task) => (task.indentLevel || 0) === 0);
  const children = source.length ? source : tasks;
  const starts = children.map((task) => viewStart(task)).filter(Boolean).sort();
  const ends = children.map((task) => viewEnd(task)).filter(Boolean).sort();

  let totalDuration = 0;
  let earned = 0;
  children.forEach((task) => {
    const duration = workingMinutesBetween(calendarFor(task), viewStart(task), viewEnd(task));
    totalDuration += duration;
    earned += duration * viewProgress(task);
  });

  const progress = totalDuration > 0
    ? Math.round(earned / totalDuration)
    : children.length
      ? Math.round(children.reduce((sum, task) => sum + viewProgress(task), 0) / children.length)
      : 0;
  const startDate = starts[0] || null;
  const endDate = ends[ends.length - 1] || null;

  return {
    id: PROJECT_SUMMARY_ID,
    projectId: project?.id,
    name: project?.name || 'Projeto',
    startDate,
    endDate,
    progress,
    dependsOn: [],
    indentLevel: 0,
    hasChildren: children.length > 0,
    isSummary: true,
    isProjectSummary: true,
    rollup: { startDate, endDate, progress },
  };
}

export default function GanttView() {
  const {
    state, addTask, addTasks, updateTasksBatch, removeTasks, showToast, updateProjectPatch,
    undo, redo, canUndo, canRedo, openTaskInspector,
  } = useContext(AppContext);

  /* ── Estado da view ─────────────────────────────────────────── */
  const [dayWidth, setDayWidth] = useState(32);
  const [gridWidth, setGridWidth] = useState(DEFAULT_GRID_W);
  const [densityId, setDensityId] = useState(() => (
    localStorage.getItem(DENSITY_KEY) || DEFAULT_GANTT_DENSITY
  ));
  const [showProjectSummary, setShowProjectSummary] = useState(() => (
    localStorage.getItem(PROJECT_SUMMARY_KEY) !== 'false'
  ));
  const [layoutCols, setLayoutCols] = useState(() => loadColumnLayout(null));
  const [columnMenu, setColumnMenu] = useState(null);
  const [showBarLabels, setShowBarLabels] = useState(true);
  /* A barra fantasma só aparece quando pedida. Antes ela era desenhada
     sempre que houvesse dados, e o interruptor existia no AppContext
     sem nenhum consumidor — meia feature dos dois lados. */
  const [showBaseline, setShowBaseline] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  const [printOrientation, setPrintOrientation] = useState('landscape');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const clipboardRef = useRef([]);

  const scrollerRef = useRef(null);
  const editInputRef = useRef(null);
  const newTaskRef = useRef(null);
  const didInitialScroll = useRef(false);
  const selectionAnchorRef = useRef(null);
  const lastCellClickRef = useRef({ taskId: null, colId: null, time: 0 });
  const pendingCellEditRef = useRef(null);

  const zoom = useMemo(
    () => ({ dayWidth, tick: tickForDayWidth(dayWidth), id: nearestZoomId(dayWidth) }),
    [dayWidth]
  );
  const density = useMemo(() => ganttDensityById(densityId), [densityId]);
  const rowH = density.rowH || ROW_H;
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, density.id);
  }, [density.id]);

  useEffect(() => {
    localStorage.setItem(PROJECT_SUMMARY_KEY, showProjectSummary ? 'true' : 'false');
  }, [showProjectSummary]);

  /* ── Calendário ─────────────────────────────────────────────────
     Cada tarefa pode ter o seu, então tudo que fala de tempo passa
     por `calendarFor` — nunca pelo calendário do projeto direto.
     Fica no topo porque a geometria e a duração dependem dele. */
  const calendars = useMemo(() => calendarsOf(activeProject), [activeProject]);
  const projectCalendar = useMemo(() => defaultCalendarOf(activeProject), [activeProject]);

  const calendarFor = useCallback(
    (task) => calendarOf(activeProject, task),
    [activeProject]
  );

  const tasks = useProjectTasks(state.tasks, state.activeProjectId, collapsedIds, activeProject);
  const applyAutoScheduling = useAutoScheduling(activeProject);
  const viewport = useScrollViewport(scrollerRef);

  /* Análise CPM completa: sempre calculada, porque a folga alimenta a
     barra fantasma mesmo com o caminho crítico desligado. */
  const analysis = useScheduleAnalysis(tasks, activeProject);
  const criticalIds = showCriticalPath ? analysis.criticalIds : EMPTY_SET;
  const mainMinSpanDays = useMemo(() => {
    const visibleTimelineWidth = Math.max(0, viewport.width - gridWidth);
    if (!visibleTimelineWidth || !zoom.dayWidth) return GANTT_MIN_SPAN_DAYS;
    return Math.max(
      GANTT_MIN_SPAN_DAYS,
      Math.ceil(visibleTimelineWidth / zoom.dayWidth) + MIN_VISIBLE_TIMELINE_PAD_DAYS
    );
  }, [gridWidth, viewport.width, zoom.dayWidth]);
  const layout = useGanttLayout(
    tasks,
    zoom.dayWidth,
    zoom.tick,
    calendarFor,
    { minSpanDays: mainMinSpanDays }
  );
  const printSpanDays = useMemo(() => {
    const starts = tasks.map((task) => viewStart(task)).filter(Boolean).sort();
    const ends = tasks.map((task) => viewEnd(task)).filter(Boolean).sort();
    const firstDate = dateOf(starts[0]) || today();
    const lastDate = dateOf(ends[ends.length - 1]) || firstDate;
    return Math.max(
      PRINT_MIN_SPAN_DAYS,
      daysBetween(addDays(firstDate, -PRINT_PAD_BEFORE), addDays(lastDate, PRINT_PAD_AFTER))
    );
  }, [tasks]);
  const printDayWidth = useMemo(() => {
    return Math.max(
      PRINT_MIN_DAY_W,
      Math.min(PRINT_MAX_DAY_W, PRINT_TIMELINE_TARGET_W[printOrientation] / printSpanDays)
    );
  }, [printOrientation, printSpanDays]);
  const printLayout = useGanttLayout(
    tasks,
    printDayWidth,
    tickForDayWidth(printDayWidth),
    calendarFor,
    {
      padBefore: PRINT_PAD_BEFORE,
      padAfter: PRINT_PAD_AFTER,
      minSpanDays: PRINT_MIN_SPAN_DAYS,
    }
  );

  /* ── Virtualização ──────────────────────────────────────────
     Sem isto, 1.000 tarefas montam ~30.000 nós e o scroll morre. */
  /* As linhas exibidas vêm do filtro; cabeçalho de grupo é uma linha
     como outra qualquer, então a virtualização não precisa saber que
     ele existe. */
  const { rows: baseRows, filteredOut } = useGanttRows(tasks, filters, analysis.criticalIds);
  const projectSummaryTask = useMemo(
    () => buildProjectSummaryTask(activeProject, tasks, calendarFor),
    [activeProject, calendarFor, tasks]
  );
  const rows = useMemo(
    () => (showProjectSummary && activeProject
      ? [{ kind: 'project-summary', id: PROJECT_SUMMARY_ID, task: projectSummaryTask }, ...baseRows]
      : baseRows),
    [activeProject, baseRows, projectSummaryTask, showProjectSummary]
  );

  /* Índice por id: com filtro ou agrupamento a posição visual deixa de
     ser o índice no array de tarefas, e as setas apontariam errado. */
  const rowIndexById = useMemo(() => {
    const map = new Map();
    rows.forEach((r, i) => { if (r.kind === 'task') map.set(r.id, i); });
    return map;
  }, [rows]);
  const selectedTasksInOrder = useMemo(
    () => rows
      .filter((row) => row.kind === 'task' && selectedIds.has(row.task.id))
      .map((row) => row.task),
    [rows, selectedIds]
  );
  const selectedDependencyCount = useMemo(() => {
    if (selectedTasksInOrder.length < 2) return 0;
    const ids = new Set(selectedTasksInOrder.map((task) => task.id));
    return selectedTasksInOrder.reduce((count, task) => (
      count + readDependencies(task.dependsOn).filter((dep) => ids.has(dep.id)).length
    ), 0);
  }, [selectedTasksInOrder]);

  const vRows = useVirtualRows(viewport, rows.length, rowH, HEADER_H);
  const vDays = useVirtualDays(viewport, gridWidth, zoom.dayWidth, layout.totalDays);
  const timelineWidth = useMemo(() => {
    const visibleTimelineWidth = Math.max(0, viewport.width - gridWidth);
    const visibleRight = viewport.left + visibleTimelineWidth;
    return Math.max(layout.totalWidth, visibleRight);
  }, [gridWidth, layout.totalWidth, viewport.left, viewport.width]);

  /* Barreira única de escrita: nada derivado (rollup, hasChildren,
     isSummary) chega ao IndexedDB. */
  const saveTasks = useCallback(
    (list, label) => updateTasksBatch(list.map(stripComputed), label),
    [updateTasksBatch]
  );

  /* A ordem é a fonte de verdade: quem está nela aparece, na posição
     em que está. Visibilidade e ordem deixam de ser dois estados que
     podem discordar. */
  const columns = useMemo(() => layoutCols.order
    .map((id) => COLUMNS.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => (layoutCols.widths[c.id] ? { ...c, width: layoutCols.widths[c.id] } : c)),
  [layoutCols]);

  const hiddenColumns = useMemo(
    () => COLUMNS.filter((c) => !layoutCols.order.includes(c.id)),
    [layoutCols]
  );

  /* Layout é por projeto: cada cronograma tem nomes de tamanho e
     colunas de interesse diferentes. */
  useEffect(() => {
    setLayoutCols(loadColumnLayout(state.activeProjectId));
  }, [state.activeProjectId]);

  const commitLayout = useCallback((next) => {
    setLayoutCols(next);
    saveColumnLayout(state.activeProjectId, next);
  }, [state.activeProjectId]);

  const handleResizeColumn = useCallback((e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = col.width;

    const onMove = (ev) => {
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, startW + ev.clientX - startX));
      setLayoutCols((prev) => ({ ...prev, widths: { ...prev.widths, [col.id]: next } }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-col-resizing');
      setLayoutCols((prev) => { saveColumnLayout(state.activeProjectId, prev); return prev; });
    };
    document.body.classList.add('is-col-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.activeProjectId]);

  /* ── Duração ────────────────────────────────────────────────── */
  /* Duração em MINUTOS ÚTEIS do calendário da tarefa. É a única
     unidade que soma certo entre uma tarefa de 8h/dia e outra de
     24h/dia na mesma cadeia. */
  const durationMinutesOf = useCallback(
    (task) => workingMinutesBetween(calendarFor(task), viewStart(task), viewEnd(task)),
    [calendarFor]
  );

  const durationLabel = useCallback(
    (task) => formatDuration(durationMinutesOf(task), calendarFor(task), {
      unit: durationDisplayOf(activeProject),
    }),
    [durationMinutesOf, calendarFor, activeProject]
  );

  const calendarLabel = useCallback(
    (task) => (task.calendarId ? calendarFor(task).name : ''),
    [calendarFor]
  );

  const formatMinutes = useCallback(
    (minutes) => formatDuration(minutes, projectCalendar, {
      unit: durationDisplayOf(activeProject),
    }),
    [projectCalendar, activeProject]
  );

  /* Predecessoras são exibidas como número de linha, não como id. */
  /* "2+3; 4II" — número da linha, tipo opcional e defasagem. TI é implícito. */
  const predecessorLabel = useCallback((dependsOn) => {
    return readDependencies(dependsOn)
      .map((dep) => {
        const index = tasks.findIndex((t) => t.id === dep.id);
        return index >= 0 ? formatDependency(dep, index + 1) : null;
      })
      .filter(Boolean)
      .join(', ');
  }, [tasks]);

  /* Devolve o que ACEITOU e o que recusou, para a UI poder dizer.
     Recusar em silêncio é o que fazia a coluna Pred. parecer quebrada. */
  const predecessorFromLabel = useCallback((label, selfId) => {
    const { deps, invalid } = parseDependencyInput(label, tasks, selfId);
    const cyclic = [];
    const accepted = deps.filter((dep) => {
      if (!wouldCreateCycle(dep.id, selfId, tasks)) return true;
      const row = tasks.findIndex((t) => t.id === dep.id);
      cyclic.push(String(row + 1));
      return false;
    });
    return { deps: accepted, invalid, cyclic };
  }, [tasks]);

  /* ── Scroll inicial até hoje ──────────────────────────────────
     Só depois que as tarefas chegam. As tarefas vêm do IndexedDB de
     forma assíncrona, então no primeiro render a lista está vazia e
     a timeline é só o padrão em torno de hoje — posicionar ali e
     marcar como feito deixava o Gantt sempre aberto na ponta
     esquerda, longe do cronograma real. */
  useEffect(() => {
    if (didInitialScroll.current || !scrollerRef.current) return;
    if (!tasks.length || !layout.todayVisible) return;
    scrollerRef.current.scrollLeft = Math.max(0, layout.todayX - 260);
    didInitialScroll.current = true;
  }, [tasks.length, layout.todayX, layout.todayVisible]);

  /* Trocar de projeto reposiciona a timeline. */
  useEffect(() => {
    didInitialScroll.current = false;
  }, [state.activeProjectId]);

  /* Ajusta a largura do dia para o projeto inteiro caber na tela. */
  const fitToProject = useCallback(() => {
    const available = (scrollerRef.current?.clientWidth || 0) - gridWidth - 24;
    if (available <= 0 || !layout.totalDays) return;
    const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, available / layout.totalDays));
    setDayWidth(next);
    requestAnimationFrame(() => { if (scrollerRef.current) scrollerRef.current.scrollLeft = 0; });
  }, [gridWidth, layout.totalDays]);

  /* ⌘+scroll mantém sob o cursor o mesmo dia que estava lá antes —
     zoom que salta para outro ponto do calendário desorienta. */
  const zoomAtCursor = useCallback((direction, clientX) => {
    const el = scrollerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const anchorPx = clientX - box.left + el.scrollLeft - gridWidth;

    setDayWidth((prev) => {
      const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, prev * (direction > 0 ? 1.15 : 1 / 1.15)));
      const anchorDay = anchorPx / prev;
      requestAnimationFrame(() => {
        if (scrollerRef.current) {
          scrollerRef.current.scrollLeft += anchorDay * (next - prev);
        }
      });
      return next;
    });
  }, [gridWidth]);

  useZoomOnWheel(scrollerRef, zoomAtCursor);

  /* ── Edição inline ──────────────────────────────────────────── */
  /* O editor abre com a MESMA unidade que o commit vai gravar. Abrir
     em dias corridos e gravar em dias úteis — o que acontecia aqui —
     empurrava uma tarefa seg–sex para a semana seguinte só de abrir a
     célula e apertar Enter. */
  const startEdit = useCallback((task, col) => {
    setEditingCell({ taskId: task.id, field: col.field, colId: col.id });
    if (col.id === 'dependencies') setEditValue(predecessorLabel(task.dependsOn));
    else if (col.id === 'duration') setEditValue(durationLabel(task));
    else if (col.id === 'mode') setEditValue(isManual(task) ? SCHEDULE_MODES.MANUAL : SCHEDULE_MODES.AUTO);
    else setEditValue(task[col.field] ?? '');
  }, [predecessorLabel, durationLabel]);

  /* ── Seleção ────────────────────────────────────────────────── */
  const handleRowMouseDown = useCallback((e, task, index) => {
    if (e.button !== 0) return;

    /* Clicar move o cursor de teclado para a coluna clicada, para o
       usuário poder alternar mouse e teclado sem perder o lugar. */
    /* Clique em <div> não move foco sozinho. Trazemos o foco para a
       grade para que as setas e o Tab cheguem ao Gantt em vez de
       continuarem no último input tocado. */
    scrollerRef.current?.focus({ preventScroll: true });

    const cell = e.target.closest?.('[data-col]');
    const colId = cell?.getAttribute('data-col') || 'name';
    setActiveCell({ taskId: task.id, colId });

    setSelectedIds((prev) => {
      if (e.shiftKey && prev.size) {
        const anchorId = selectionAnchorRef.current || [...prev][0];
        const from = rowIndexById.get(anchorId) ?? index;
        const to = rowIndexById.get(task.id) ?? index;
        const [start, end] = [from, to].sort((a, b) => a - b);
        const rangeIds = rows
          .slice(start, end + 1)
          .filter((row) => row.kind === 'task')
          .map((row) => row.task.id);
        return new Set(e.metaKey || e.ctrlKey ? [...prev, ...rangeIds] : rangeIds);
      }
      if (e.metaKey || e.ctrlKey) {
        selectionAnchorRef.current = task.id;
        const next = new Set(prev);
        next.has(task.id) ? next.delete(task.id) : next.add(task.id);
        return next;
      }
      selectionAnchorRef.current = task.id;
      return new Set([task.id]);
    });
  }, [rowIndexById, rows]);

  const cancelPendingCellEdit = useCallback(() => {
    if (!pendingCellEditRef.current) return;
    window.clearTimeout(pendingCellEditRef.current);
    pendingCellEditRef.current = null;
  }, []);

  useEffect(() => cancelPendingCellEdit, [cancelPendingCellEdit]);

  const handleRowDoubleClick = useCallback((e, task) => {
    cancelPendingCellEdit();
    lastCellClickRef.current = { taskId: null, colId: null, time: 0 };
    const cell = e?.target?.closest?.('[data-col]');
    if (!cell) return;
    const colId = cell.getAttribute('data-col');
    const col = columns.find((item) => item.id === colId);
    const locked = task.isSummary && col?.summaryLocked;
    if (!col?.editable || locked) return;
    document.getSelection?.()?.removeAllRanges?.();
    startEdit(task, col);
  }, [cancelPendingCellEdit, columns, startEdit]);

  const handleRowClick = useCallback((e, task) => {
    cancelPendingCellEdit();

    const cell = e.target.closest?.('[data-col]');
    const colId = cell?.getAttribute('data-col') || 'name';
    const col = columns.find((item) => item.id === colId);
    const locked = task.isSummary && col?.summaryLocked;
    const now = performance.now();
    const elapsed = now - (lastCellClickRef.current.time || 0);
    const sameCell =
      lastCellClickRef.current.taskId === task.id
      && lastCellClickRef.current.colId === colId
      && activeCell?.taskId === task.id
      && activeCell?.colId === colId;
    const canSlowEdit =
      cell && e.detail === 1 && !e.shiftKey && !e.metaKey && !e.ctrlKey
      && col?.editable && !locked
      && selectedIds.has(task.id)
      && sameCell
      && elapsed >= SLOW_EDIT_CLICK_DELAY_MS;

    lastCellClickRef.current = { taskId: task.id, colId, time: now };

    if (!canSlowEdit) return;

    pendingCellEditRef.current = window.setTimeout(() => {
      pendingCellEditRef.current = null;
      document.getSelection?.()?.removeAllRanges?.();
      startEdit(task, col);
    }, DOUBLE_CLICK_GUARD_MS);
  }, [activeCell, cancelPendingCellEdit, columns, selectedIds, startEdit]);

  const toggleCollapse = useCallback((taskId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }, []);

  const commitEdit = useCallback(async (overrideValue) => {
    if (!editingCell) return;
    const task = tasks.find((t) => t.id === editingCell.taskId);
    if (!task) { setEditingCell(null); return; }

    const cal = calendarFor(task);
    const duration = workingMinutesBetween(cal, task.startDate, task.endDate);
    let modified;
    let becameManual = false;
    let rejected = null;
    const valueToCommit = typeof overrideValue === 'string' ? overrideValue : editValue;

    switch (editingCell.colId) {
      case 'duration': {
        const minutes = resolveDuration(valueToCommit, cal, duration);
        modified = minutes === null || minutes === duration
          ? task
          : { ...task, endDate: addWorkingMinutes(cal, task.startDate, minutes) };
        break;
      }

      case 'start': {
        /* Editar o início DESLOCA a tarefa preservando a duração.
           Antes gravava só o campo, então a tarefa mudava de duração
           em vez de andar — e o término ficava onde estava. */
        const start = snapForward(cal, valueToCommit);
        if (!start) { modified = task; break; }
        modified = { ...task, startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
        /* Fixar o início à mão numa tarefa que TEM predecessora é uma
           decisão sobre o cronograma, não sobre esta tarefa: sem virar
           manual, o próximo recálculo desfaria a digitação em silêncio. */
        if (!isManual(task) && readDependencies(task.dependsOn).length) {
          modified.scheduleMode = SCHEDULE_MODES.MANUAL;
          becameManual = true;
        }
        break;
      }

      case 'end': {
        /* O término muda a DURAÇÃO, mantendo o início.

           Duas correções: encaixa no calendário — antes o Início
           passava por snapForward e o Término gravava cru, então dava
           para terminar domingo 03:00 num calendário Seg–Sex, uma data
           que o motor jamais produziria; e AVISA ao recusar, em vez de
           limpar a célula sem dizer nada. */
        if (!valueToCommit) { modified = task; break; }
        if (valueToCommit <= task.startDate) {
          modified = task;
          rejected = 'O término tem que ser depois do início.';
          break;
        }
        modified = { ...task, endDate: snapBackward(cal, valueToCommit) };
        break;
      }

      case 'constraintType': {
        const type = valueToCommit || CONSTRAINT_NONE;
        modified = { ...task, constraintType: type };
        /* Uma restrição sem data não restringe nada: semeia com o
           início atual para o efeito ser imediato e visível. */
        if (type !== CONSTRAINT_NONE && !task.constraintDate) {
          modified.constraintDate = task.startDate;
        }
        if (type === CONSTRAINT_NONE) delete modified.constraintDate;
        break;
      }

      case 'constraintDate': {
        if (!task.constraintType || task.constraintType === CONSTRAINT_NONE) {
          modified = task;
          rejected = 'Escolha primeiro o tipo de restrição na coluna ao lado.';
          break;
        }
        modified = { ...task, constraintDate: snapForward(cal, valueToCommit) };
        break;
      }

      case 'dependencies': {
        /* Antes o parser descartava em silêncio o que não casava e o
           que fecharia ciclo: a célula voltava vazia e parecia um campo
           quebrado. Agora ele conta o que recusou e por quê. */
        const { deps, invalid, cyclic } = predecessorFromLabel(valueToCommit, task.id);
        modified = { ...task, dependsOn: deps };
        if (cyclic.length) {
          rejected = `Ignorado: ${cyclic.join(', ')} criaria dependência circular.`;
        } else if (invalid.length) {
          rejected = `Não reconhecido: ${invalid.join('; ')}. Use o número da linha, ex.: 2+3; 4II`;
        }
        break;
      }

      case 'progress':
        modified = { ...task, progress: clampProgress(valueToCommit) };
        break;

      case 'mode':
        modified = { ...task, scheduleMode: valueToCommit || SCHEDULE_MODES.AUTO };
        break;

      case 'calendar': {
        /* Trocar de calendário mantém o início e a duração real em
           minutos. A jornada muda o encaixe no relógio, mas "4h"
           continua sendo 4h, independentemente do calendário escolhido. */
        modified = rebaseTaskCalendar(activeProject, task, valueToCommit);
        break;
      }

      default:
        modified = { ...task, [editingCell.field]: valueToCommit };
    }

    /* Só o que mexe no cronograma dispara o forward pass. */
    const reschedules = [
      'duration', 'start', 'end', 'dependencies', 'mode', 'calendar',
      'constraintType', 'constraintDate',
    ].includes(editingCell.colId);
    await saveTasks(reschedules ? applyAutoScheduling(modified, tasks) : [modified]);
    setEditingCell(null);

    if (rejected) showToast(rejected, 'error');
    if (becameManual) {
      showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
    }
  }, [
    editingCell, editValue, tasks, calendarFor, activeProject,
    predecessorFromLabel, applyAutoScheduling, updateTasksBatch, showToast,
  ]);

  /* ── Arrastar barra ───────────────────────────────────────────
     O deslocamento é contado em MINUTOS ÚTEIS do calendário da tarefa,
     não em dias corridos. Somar dias corridos deixava a barra parar no
     sábado ou num feriado — uma data que o motor jamais produziria
     sozinho, e que o próximo recálculo corrigia sozinho, dando a
     impressão de que o arrasto "não pegou". */
  const beginBarDrag = useCallback((e, task, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(new Set([task.id]));
    setTooltip(null);

    const cal = calendarFor(task);
    const perDay = minutesPerDay(cal);
    const subday = zoom.dayWidth >= SUBDAY_MIN_DAY_W;
    const startX = e.clientX;
    const origStart = task.startDate;
    const origEnd = task.endDate;
    const duration = workingMinutesBetween(cal, origStart, origEnd);
    let delta = 0;

    const deltaAt = (clientX) => {
      const days = (clientX - startX) / zoom.dayWidth;
      return subday
        ? Math.round((days * perDay) / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
        : Math.round(days) * perDay;
    };

    const previewFor = (minutes) => {
      if (mode === 'move') {
        const start = addWorkingMinutes(cal, origStart, minutes);
        return { taskId: task.id, startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
      }
      return { taskId: task.id, startDate: origStart, endDate: addWorkingMinutes(cal, origEnd, minutes) };
    };

    const onMove = (ev) => {
      const next = deltaAt(ev.clientX);
      if (next === delta) return; // só re-renderiza quando o valor muda
      delta = next;
      setDragPreview(previewFor(delta));
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragPreview(null);
      if (delta === 0) return;

      const { startDate, endDate } = previewFor(delta);
      if (endDate < startDate) return; // resize não pode inverter a barra

      const modified = { ...task, startDate, endDate };
      let becameManual = false;
      if (mode === 'move' && !isManual(task) && readDependencies(task.dependsOn).length) {
        modified.scheduleMode = SCHEDULE_MODES.MANUAL;
        becameManual = true;
      }

      await saveTasks(applyAutoScheduling(modified, tasks));
      if (becameManual) {
        showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [zoom.dayWidth, tasks, calendarFor, applyAutoScheduling, updateTasksBatch, showToast]);

  const handleBarMouseDown = useCallback((e, task) => {
    if (task.isSummary) return; // resumo é calculado, não arrastável
    beginBarDrag(e, task, 'move');
  }, [beginBarDrag]);

  const handleResizeMouseDown = useCallback((e, task) => {
    beginBarDrag(e, task, 'resize');
  }, [beginBarDrag]);

  /* ── Tooltip ────────────────────────────────────────────────── */
  const showTooltip = useCallback((e, task) => {
    const host = scrollerRef.current?.getBoundingClientRect();
    if (!host) return;
    setTooltip({
      task,
      x: e.clientX - host.left,
      y: e.clientY - host.top,
      flipX: e.clientX > window.innerWidth - 320,
    });
  }, []);

  const moveTooltip = useCallback((e) => {
    const host = scrollerRef.current?.getBoundingClientRect();
    if (!host) return;
    setTooltip((prev) => prev && {
      ...prev,
      x: e.clientX - host.left,
      y: e.clientY - host.top,
      flipX: e.clientX > window.innerWidth - 320,
    });
  }, []);

  /* ── Reordenar linhas ───────────────────────────────────────── */
  const handleRowDrop = useCallback(async (e, targetTask) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!draggedTaskId || draggedTaskId === targetTask.id) {
      setDraggedTaskId(null);
      return;
    }

    const draggedIndex = tasks.findIndex((task) => task.id === draggedTaskId);
    const targetIndex = tasks.findIndex((task) => task.id === targetTask.id);
    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggedTaskId(null);
      return;
    }

    const reordered = [...tasks];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered
      .map((t, i) => (t.order !== i ? { ...t, order: i } : null))
      .filter(Boolean);
    if (updates.length) await saveTasks(updates);
    setDraggedTaskId(null);
  }, [draggedTaskId, saveTasks, tasks]);

  const handleLinkSelected = useCallback(async () => {
    if (selectedTasksInOrder.length < 2) {
      showToast('Selecione pelo menos duas tarefas para vincular.', 'info');
      return;
    }

    let working = tasks;
    const updatesById = new Map();
    let created = 0;
    let skipped = 0;

    for (let i = 1; i < selectedTasksInOrder.length; i += 1) {
      const predecessor = selectedTasksInOrder[i - 1];
      const successor = selectedTasksInOrder[i];
      const current = updatesById.get(successor.id)
        || working.find((task) => task.id === successor.id)
        || successor;

      if (wouldCreateCycle(predecessor.id, successor.id, working)) {
        skipped += 1;
        continue;
      }

      const nextDeps = [
        ...readDependencies(current.dependsOn).filter((dep) => dep.id !== predecessor.id),
        { id: predecessor.id, type: 'FS', lag: 0 },
      ];
      const scheduled = applyAutoScheduling({ ...current, dependsOn: nextDeps }, working);

      scheduled.forEach((task) => {
        updatesById.set(task.id, task);
      });
      working = working.map((task) => updatesById.get(task.id) || task);
      created += 1;
    }

    const updates = [...updatesById.values()];
    if (updates.length) await saveTasks(updates, 'Vincular tarefas');

    if (created) showToast(`${created} vínculo(s) criado(s).`, 'success');
    if (skipped) {
      showToast('Alguns vínculos foram ignorados para evitar dependência circular.', 'error');
    }
  }, [applyAutoScheduling, saveTasks, selectedTasksInOrder, showToast, tasks]);

  const handleUnlinkSelected = useCallback(async () => {
    if (selectedTasksInOrder.length < 2) {
      showToast('Selecione pelo menos duas tarefas para remover vínculos entre elas.', 'info');
      return;
    }

    const selected = new Set(selectedTasksInOrder.map((task) => task.id));
    let working = tasks;
    const updatesById = new Map();
    let removed = 0;

    selectedTasksInOrder.forEach((task) => {
      const current = updatesById.get(task.id)
        || working.find((item) => item.id === task.id)
        || task;
      const deps = readDependencies(current.dependsOn);
      const nextDeps = deps.filter((dep) => !selected.has(dep.id));
      if (nextDeps.length === deps.length) return;

      removed += deps.length - nextDeps.length;
      applyAutoScheduling({ ...current, dependsOn: nextDeps }, working).forEach((item) => {
        updatesById.set(item.id, item);
      });
      working = working.map((item) => updatesById.get(item.id) || item);
    });

    if (!removed) {
      showToast('A seleção não tem vínculos entre si para remover.', 'info');
      return;
    }

    await saveTasks([...updatesById.values()], 'Remover vínculos entre tarefas');
    showToast(`${removed} vínculo(s) removido(s) da seleção.`, 'success');
  }, [applyAutoScheduling, saveTasks, selectedTasksInOrder, showToast, tasks]);

  /* ── Splitter ───────────────────────────────────────────────── */
  const handleSplitterDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = gridWidth;
    const onMove = (ev) => {
      setGridWidth(Math.max(MIN_GRID_W, Math.min(MAX_GRID_W, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-col-resizing');
    };
    document.body.classList.add('is-col-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [gridWidth]);

  /* ── Ações ──────────────────────────────────────────────────── */
  const buildNewTask = useCallback((name, order) => {
    const start = workdayStart(projectCalendar, today());
    return {
      id: generateId(),
      projectId: state.activeProjectId,
      name,
      startDate: start,
      endDate: addWorkingMinutes(projectCalendar, start, 5 * minutesPerDay(projectCalendar)),
      scheduleMode: SCHEDULE_MODES.AUTO,
      progress: 0,
      dependsOn: [],
      indentLevel: 0,
      order,
    };
  }, [projectCalendar, state.activeProjectId]);

  const handleAddTask = useCallback(async (e) => {
    if (e.key !== 'Enter' || !newTaskName.trim()) return;
    /* Nasce AUTOMÁTICA e com jornada: começa na abertura do próximo
       dia útil e dura 5 dias do calendário padrão do projeto. */
    await addTask(buildNewTask(newTaskName.trim(), tasks.length));
    setNewTaskName('');
    setTimeout(() => newTaskRef.current?.focus(), 40);
  }, [newTaskName, tasks.length, addTask, buildNewTask]);

  const handlePasteNewTasks = useCallback(async (e) => {
    const names = taskNamesFromPaste(e.clipboardData?.getData('text/plain'));
    if (names.length < 2) return;

    e.preventDefault();
    const inserted = names.map((name, index) => buildNewTask(name, tasks.length + index));
    await addTasks(inserted);
    setNewTaskName('');
    setTimeout(() => newTaskRef.current?.focus(), 40);
    showToast(`${inserted.length} tarefas adicionadas`, 'success');
  }, [addTasks, buildNewTask, showToast, tasks.length]);

  /* Gravar a linha de base era um tiro só: carimbava o projeto inteiro,
     sem como limpar, sem como restringir à seleção e sem como ocultar.
     Uma vez gravada, cada linha ganhava uma barra fantasma permanente. */
  const baselineCount = useMemo(
    () => tasks.filter((t) => t.baselineStart && t.baselineEnd).length,
    [tasks]
  );

  const saveBaseline = (scope) => {
    const target = scope === 'selection'
      ? tasks.filter((t) => selectedIds.has(t.id))
      : tasks;
    const updates = target
      .filter((t) => viewStart(t) && viewEnd(t))
      .map((t) => ({ ...t, baselineStart: viewStart(t), baselineEnd: viewEnd(t) }));
    if (!updates.length) return;

    setConfirmAction({
      title: scope === 'selection' ? 'Gravar da seleção' : 'Gravar do projeto',
      message: `Grava as datas atuais como linha de base de ${updates.length} tarefa(s), `
        + 'substituindo a anterior. ⌘Z desfaz.',
      onConfirm: async () => {
        await saveTasks(updates, 'Gravar linha de base');
        setShowBaseline(true);
        showToast(`Linha de base gravada em ${updates.length} tarefa(s)`, 'success');
      },
    });
  };

  const clearBaseline = () => setConfirmAction({
    title: 'Limpar linha de base',
    message: `Remove a linha de base de ${baselineCount} tarefa(s). `
      + 'A Curva S e o desvio voltam a ficar indisponíveis. ⌘Z desfaz.',
    onConfirm: async () => {
      const updates = tasks
        .filter((t) => t.baselineStart || t.baselineEnd)
        .map(({ baselineStart, baselineEnd, ...rest }) => rest);
      await saveTasks(updates, 'Limpar linha de base');
      showToast('Linha de base removida', 'info');
    },
  });

  const exportToExcel = () => {
    const header = ['#', 'Tarefa', 'Duração', 'Início', 'Término', 'Modo', 'Calendário',
      '% Concluída', '% Planejada', 'Início Baseline', 'Término Baseline',
      'Recursos', 'Grupo', 'Predecessoras'];
    const rows = tasks.map((t, i) => [
      i + 1, t.name, durationLabel(t),
      formatDateTimeShort(t.startDate), formatDateTimeShort(t.endDate),
      isManual(t) ? 'Manual' : 'Automática', calendarFor(t).name,
      clampProgress(t.progress),
      calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd),
      formatDateTimeShort(t.baselineStart), formatDateTimeShort(t.baselineEnd),
      t.resources || '', t.resourceGroup || '', predecessorLabel(t.dependsOn),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Gantt');
    XLSX.writeFile(wb, `${activeProject?.name || 'Projeto'}_Gantt.xlsx`);
  };

  const exportToPdf = useCallback(() => {
    if (!tasks.length) {
      showToast('Não há tarefas para exportar em PDF.', 'info');
      return;
    }

    setTooltip(null);
    setEditingCell(null);

    const previousTitle = document.title;
    document.querySelector('#gantt-print-page-style')?.remove();
    const pageStyle = document.createElement('style');
    pageStyle.id = 'gantt-print-page-style';
    pageStyle.textContent = `@page { size: A4 ${printOrientation}; margin: ${printOrientation === 'portrait' ? '10mm' : '8mm'}; }`;
    document.title = activeProject?.name || 'Cronograma Gantt';
    document.head.appendChild(pageStyle);
    document.body.classList.add('is-printing-gantt', `is-printing-gantt-${printOrientation}`);

    const cleanup = () => {
      document.body.classList.remove('is-printing-gantt', `is-printing-gantt-${printOrientation}`);
      pageStyle.remove();
      document.title = previousTitle;
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 40);
    });
  }, [activeProject?.name, printOrientation, showToast, tasks.length]);

  /* ── Colunas (modelo MS Project) ─────────────────────────────
     Gerenciadas no próprio cabeçalho: botão direito na coluna para
     ocultar, ajustar largura ou inserir vizinhas. Acrescentar uma
     coluna ALARGA a planilha em vez de roubar espaço do nome da
     tarefa — era o que fazia o antigo dropdown parecer quebrado. */
  const columnActions = useMemo(() => ({
    hide: (id) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (!col || col.alwaysOn) return;
      commitLayout({ ...layoutCols, order: layoutCols.order.filter((x) => x !== id) });
      setGridWidth((w) => Math.max(MIN_GRID_W, w - (layoutCols.widths[id] || col.width)));
    },
    insert: (id, anchorId, side) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (!col || layoutCols.order.includes(id)) return;
      const next = [...layoutCols.order];
      const at = next.indexOf(anchorId);
      next.splice(side === 'before' ? Math.max(1, at) : at + 1, 0, id);
      commitLayout({ ...layoutCols, order: next });
      setGridWidth((w) => Math.min(MAX_GRID_W, w + col.width));
    },
    autoFit: (id) => {
      /* Mede o conteúdo real das células desta coluna. */
      const cells = document.querySelectorAll(`[data-col="${id}"] .gantt-cell-text`);
      let widest = 0;
      cells.forEach((el) => { widest = Math.max(widest, el.scrollWidth); });
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, widest + 24));
      commitLayout({ ...layoutCols, widths: { ...layoutCols.widths, [id]: next } });
    },
  }), [layoutCols, commitLayout]);

  const openColumnMenu = useCallback((e, col) => {
    e.preventDefault();
    setColumnMenu({ x: e.clientX, y: e.clientY, column: col, available: hiddenColumns });
  }, [hiddenColumns]);

  /* ── Hierarquia ─────────────────────────────────────────────── */
  const targetTasks = useCallback(() => {
    if (selectedIds.size) return tasks.filter((t) => selectedIds.has(t.id));
    const active = tasks.find((t) => t.id === activeCell?.taskId);
    return active ? [active] : [];
  }, [tasks, selectedIds, activeCell]);

  const handleIndent = useCallback(async (delta) => {
    const targets = targetTasks();
    if (!targets.length) return;

    const updates = targets.map((task) => {
      const index = tasks.findIndex((t) => t.id === task.id);
      const prev = tasks[index - 1];
      /* Não dá para indentar além de um nível abaixo da linha acima —
         isso produziria um "filho" sem pai. */
      const ceiling = prev ? (prev.indentLevel || 0) + 1 : 0;
      const next = Math.max(0, Math.min(ceiling, (task.indentLevel || 0) + delta));
      return next === (task.indentLevel || 0) ? null : { ...task, indentLevel: next };
    }).filter(Boolean);

    if (updates.length) await saveTasks(updates, 'Alterar hierarquia');
  }, [tasks, targetTasks, updateTasksBatch]);

  /* ── Clipboard ──────────────────────────────────────────────── */
  const handleCopy = useCallback(() => {
    const targets = targetTasks();
    if (!targets.length) return;
    clipboardRef.current = targets.map((t) => ({ ...t }));
    showToast(`${targets.length} tarefa(s) copiada(s)`, 'info');
  }, [targetTasks, showToast]);

  const pasteTasks = useCallback(async (source) => {
    if (!source.length) return;
    /* Cópias entram sem dependências: os ids referenciados apontam
       para as tarefas originais e a cópia herdaria vínculos errados. */
    const clones = source.map((t, i) => ({
      ...t,
      id: generateId(),
      name: `${t.name} (cópia)`,
      dependsOn: [],
      order: tasks.length + i,
    }));
    await addTasks(clones);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [tasks.length, addTasks]);

  const handlePaste = useCallback(() => pasteTasks(clipboardRef.current), [pasteTasks]);
  const handleDuplicate = useCallback(() => pasteTasks(targetTasks()), [pasteTasks, targetTasks]);

  const handleDeleteSelected = useCallback(() => {
    const targets = targetTasks();
    if (!targets.length) return;
    setConfirmAction({
      title: targets.length > 1 ? 'Excluir tarefas' : 'Excluir tarefa',
      message: targets.length > 1
        ? `Excluir ${targets.length} tarefas selecionadas?`
        : `Excluir "${targets[0].name}"?`,
      onConfirm: async () => {
        await removeTasks(targets.map((t) => t.id));
        setSelectedIds(new Set());
      },
    });
  }, [targetTasks, removeTasks]);

  /* ── Arrastar progresso ─────────────────────────────────────── */
  const handleProgressDrag = useCallback((e, task) => {
    e.preventDefault();
    e.stopPropagation();
    const bar = e.currentTarget.parentElement;
    const box = bar.getBoundingClientRect();
    let next = clampProgress(task.progress);

    const onMove = (ev) => {
      next = clampProgress(Math.round(((ev.clientX - box.left) / box.width) * 100));
      /* Escrita imperativa: durante o arrasto não há re-render, então
         mover a alça pelo DOM mantém o gesto fluido. */
      bar.querySelector('.gantt-bar-fill').style.width = `${next}%`;
      e.target.style.left = `${next}%`;
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (next !== clampProgress(task.progress)) {
        await saveTasks([{ ...task, progress: next }], 'Ajustar progresso');
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateTasksBatch]);

  /* ── Menu de contexto ───────────────────────────────────────── */
  const handleContextMenu = useCallback((e, task) => {
    e.preventDefault();
    if (!selectedIds.has(task.id)) setSelectedIds(new Set([task.id]));
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, [selectedIds]);

  /* ── Teclado ────────────────────────────────────────────────── */
  useGanttKeyboard({
    enabled: !state.inspectorTaskId && !confirmAction,
    tasks, columns, activeCell, setActiveCell, editingCell,
    startEdit, commitEdit,
    cancelEdit: () => setEditingCell(null),
    selectedIds, setSelectedIds,
    onIndent: handleIndent,
    onDeleteSelected: handleDeleteSelected,
    onDuplicateSelected: handleDuplicate,
    onCopySelected: handleCopy,
    onPasteClipboard: handlePaste,
    onToggleCollapse: (id, collapse) => setCollapsedIds((prev) => {
      const next = new Set(prev);
      collapse ? next.add(id) : next.delete(id);
      return next;
    }),
  });

  if (!activeProject) return null;

  const ctx = {
    columns, gridWidth, layout, selectedIds, editingCell, collapsedIds,
    criticalIds, showCriticalPath, showBarLabels, showBaseline,
    timelineWidth,
    dragPreview, dragOverIndex,
    editValue, editInputRef, predecessorLabel,
    durationLabel, calendarLabel, calendarFor, formatMinutes,
    calendars, projectCalendarName: projectCalendar.name,
    analysis,
    showSlack,
    activeCell,
    onProgressDrag: handleProgressDrag,
    onContextMenu: handleContextMenu,
    onRowMouseDown: handleRowMouseDown,
    onRowClick: handleRowClick,
    onRowDoubleClick: handleRowDoubleClick,
    onToggleCollapse: toggleCollapse,
    onStartEdit: startEdit,
    onEditChange: setEditValue,
    onCommitEdit: commitEdit,
    onCancelEdit: () => setEditingCell(null),
    onBarMouseDown: handleBarMouseDown,
    onResizeMouseDown: handleResizeMouseDown,
    onBarEnter: showTooltip,
    onBarMove: moveTooltip,
    onBarLeave: () => setTooltip(null),
    onOpenDetails: (task) => openTaskInspector(task.id),
    onRowDragStart: (e, task) => {
      setDraggedTaskId(task.id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', task.id);
    },
    onRowDragOver: (e, i) => {
      if (!draggedTaskId) return;
      e.preventDefault();
      if (dragOverIndex !== i) setDragOverIndex(i);
    },
    onRowDrop: handleRowDrop,
    onRowDragEnd: () => { setDraggedTaskId(null); setDragOverIndex(null); },
  };

  /* Fase da faixa de fim de semana: alinha o gradiente de 7 dias ao
     dia da semana em que a timeline começa. */
  const weekendPhase =
    ((new Date(`${layout.rangeStart}T00:00:00Z`).getUTCDay() + 6) % 7) * zoom.dayWidth;
  const displayMenuActive =
    density.id !== DEFAULT_GANTT_DENSITY ||
    !showProjectSummary ||
    !showBarLabels ||
    showCriticalPath ||
    showSlack;
  const planningMenuActive = baselineCount > 0 || selectedIds.size >= 2 || selectedDependencyCount > 0;

  return (
    <div
      className={`gantt-view is-density-${density.id}`}
      style={{
        '--gantt-row-h': `${rowH}px`,
        '--gantt-text-body': density.textBody,
        '--gantt-text-small': density.textSmall,
        '--gantt-text-micro': density.textMicro,
        '--gantt-cell-px': `${density.cellPadding}px`,
      }}
    >
      <ViewBar className="gantt-commandbar !overflow-x-hidden !overflow-y-visible">
        <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Escala do Gantt">
          <ViewBarSegments
            options={ZOOM_LEVELS.map((z) => ({ id: z.id, label: z.label }))}
            value={zoom.id}
            onChange={(id) => setDayWidth(ZOOM_LEVELS.find((z) => z.id === id).dayWidth)}
          />
          <ViewBarButton icon={Maximize2} onClick={fitToProject} title="Ajustar o projeto inteiro à tela">
            Ajustar
          </ViewBarButton>
        </div>

        <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Comandos do Gantt">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ViewBarButton icon={FolderTree} active={displayMenuActive}>
                Exibição
              </ViewBarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
                Densidade
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density.id} onValueChange={setDensityId}>
                {GANTT_DENSITIES.map((item) => (
                  <DropdownMenuRadioItem
                    key={item.id}
                    value={item.id}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem
                  checked={showProjectSummary}
                  onCheckedChange={setShowProjectSummary}
                  onSelect={(e) => e.preventDefault()}
                >
                  Resumo global
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showBarLabels}
                  onCheckedChange={setShowBarLabels}
                  onSelect={(e) => e.preventDefault()}
                >
                  Rótulos nas barras
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showCriticalPath}
                  onCheckedChange={setShowCriticalPath}
                  onSelect={(e) => e.preventDefault()}
                >
                  Caminho crítico
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showSlack}
                  onCheckedChange={setShowSlack}
                  onSelect={(e) => e.preventDefault()}
                >
                  Folga total
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ViewBarButton icon={Target} active={planningMenuActive}>
                Planejar
              </ViewBarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
                Seleção
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={selectedIds.size < 2}
                  onSelect={handleLinkSelected}
                >
                  <Link2 />
                  Vincular término-início
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedDependencyCount === 0}
                  onSelect={handleUnlinkSelected}
                >
                  <Link2Off />
                  Remover vínculos da seleção
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
                {baselineCount > 0
                  ? `Linha de base: ${baselineCount}/${tasks.length}`
                  : 'Linha de base'}
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => saveBaseline('project')}>
                  Gravar do projeto inteiro
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedIds.size === 0}
                  onSelect={() => saveBaseline('selection')}
                >
                  Gravar da seleção ({selectedIds.size})
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  checked={showBaseline}
                  disabled={baselineCount === 0}
                  onCheckedChange={setShowBaseline}
                  onSelect={(e) => e.preventDefault()}
                >
                  Mostrar na barra
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem
                  disabled={baselineCount === 0}
                  onSelect={clearBaseline}
                  className="text-sched-late"
                >
                  Limpar linha de base
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <GanttCalendarMenu
            project={activeProject}
            tasks={tasks}
            triggerLabel="Calendário"
            onChange={(patch) => updateProjectPatch(state.activeProjectId, patch)}
          />

          <GanttFilterMenu filters={filters} onChange={setFilters} filteredOut={filteredOut} />
        </div>

        <div className="ml-auto" />

        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Histórico de edição">
          <ViewBarButton icon={Undo2} onClick={undo} disabled={!canUndo} title="Desfazer (⌘Z)" />
          <ViewBarButton icon={Redo2} onClick={redo} disabled={!canRedo} title="Refazer (⇧⌘Z)" />
        </div>

        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Saída e criação">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ViewBarButton icon={Download} title="Exportar cronograma">
                Exportar
              </ViewBarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
                Arquivos
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={exportToExcel}>
                <Download />
                Exportar para Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1 text-micro uppercase tracking-wide text-text-3">
                  PDF
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={printOrientation} onValueChange={setPrintOrientation}>
                  <DropdownMenuRadioItem value="landscape" onSelect={(e) => e.preventDefault()}>
                    Paisagem
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="portrait" onSelect={(e) => e.preventDefault()}>
                    Retrato
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={exportToPdf}>
                <FileText />
                Imprimir ou salvar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ViewBarButton icon={Plus} variant="primary" onClick={() => newTaskRef.current?.focus()}>
            Tarefa
          </ViewBarButton>
        </div>
      </ViewBar>

      {/* Ciclo e prazo estourado: a análise já media os dois e nenhum
          componente lia. Um cronograma com dependência circular não tem
          ordem topológica — o CPM anexa os nós presos ao fim para não
          travar, e sem este aviso o usuário via datas estranhas sem
          nenhuma pista do motivo. */}
      {(analysis.cycles.length > 0 || analysis.deadlineIds.size > 0) && (
        <div className="flex shrink-0 flex-col gap-1 border-b border-line bg-sched-late-soft px-3 py-2">
          {analysis.cycles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, text: '' });
                setSelectedIds(new Set(analysis.cycles));
              }}
              className="flex items-center gap-2 text-left text-small font-medium text-sched-late"
            >
              <AlertCircle size={14} strokeWidth={2} />
              {analysis.cycles.length} tarefa(s) em dependência circular — o
              cronograma não pode ser calculado até que o laço seja desfeito.
              <span className="underline underline-offset-2">Selecionar</span>
            </button>
          )}
          {analysis.deadlineIds.size > 0 && (
            <span className="flex items-center gap-2 text-small text-sched-late">
              <AlertCircle size={14} strokeWidth={2} />
              {analysis.deadlineIds.size} tarefa(s) terminam depois do prazo
              definido na restrição.
            </span>
          )}
        </div>
      )}

      {/* ── Corpo: UM scroller para os dois eixos ───────────────── */}
      <div className="gantt-body">
        <div className="gantt-scroller" ref={scrollerRef} tabIndex={0}>
          <div
            className="gantt-canvas"
            style={{
              '--gantt-grid-w': `${gridWidth}px`,
              '--gantt-day-w': `${zoom.dayWidth}px`,
              '--gantt-week-w': `${zoom.dayWidth * 7}px`,
              '--gantt-weekend-phase': `${-weekendPhase}px`,
              '--gantt-scroll-left': `${viewport.left}px`,
              width: gridWidth + timelineWidth,
            }}
          >
            <GanttHeader
              columns={columns}
              gridWidth={gridWidth}
              layout={layout}
              zoom={zoom}
              timelineWidth={timelineWidth}
              visibleDays={vDays}
              onResizeColumn={handleResizeColumn}
              onColumnMenu={openColumnMenu}
            />

            <div className="gantt-rows">
              {/* Fundo da timeline: gradientes em vez de um div por dia */}
              <div
                className={[
                  'gantt-grid-bg',
                  zoom.tick !== 'month' ? 'has-weekends' : '',
                  zoom.tick === 'day' ? 'has-day-lines' : '',
                ].filter(Boolean).join(' ')}
                style={{ left: gridWidth, width: timelineWidth }}
              />

              {layout.months.map((m) => (
                <div
                  key={`sep-${m.key}`}
                  className="gantt-month-sep"
                  style={{ left: gridWidth + m.startIndex * zoom.dayWidth }}
                />
              ))}

              {layout.todayVisible && (
                <div className="gantt-today-line" style={{ left: gridWidth + layout.todayX }} />
              )}

              <GanttDependencies
                tasks={tasks}
                layout={layout}
                rowH={rowH}
                timelineWidth={timelineWidth}
                criticalIds={criticalIds}
                showCriticalPath={showCriticalPath}
                selectedId={selectedIds.size === 1 ? [...selectedIds][0] : null}
                visibleRange={vRows}
                rowIndexById={rowIndexById}
                rowCount={rows.length}
              />

              {/* Spacers em vez de transform: transform criaria um novo
                  bloco de contenção e quebraria o sticky da planilha. */}
              {vRows.padTop > 0 && <div style={{ height: vRows.padTop }} aria-hidden="true" />}

              {rows.slice(vRows.start, vRows.end).map((row, i) =>
                row.kind === 'project-summary' ? (
                  <GanttProjectSummaryRow
                    key={row.id}
                    task={row.task}
                    columns={columns}
                    gridWidth={gridWidth}
                    layout={layout}
                    timelineWidth={timelineWidth}
                    ctx={ctx}
                    showBarLabels={showBarLabels}
                  />
                ) : row.kind === 'group' ? (
                  <GanttGroupRow
                    key={row.id}
                    row={row}
                    gridWidth={gridWidth}
                    layout={layout}
                    timelineWidth={timelineWidth}
                  />
                ) : (
                  <GanttRow
                    key={row.id}
                    task={row.task}
                    index={vRows.start + i}
                    rowNumber={(tasks.findIndex((task) => task.id === row.task.id) + 1) || undefined}
                    ctx={ctx}
                  />
                )
              )}

              {vRows.padBottom > 0 && <div style={{ height: vRows.padBottom }} aria-hidden="true" />}

              {/* Linha de entrada rápida */}
              <div className="gantt-row is-new">
                <div className="gantt-row-grid" style={{ width: gridWidth }}>
                  <div className="gantt-cell gantt-cell-index">
                    <Plus size={12} className="text-text-3" />
                  </div>
                  <div className="gantt-cell is-left" style={{ flex: '1 1 auto' }}>
                    <input
                      ref={newTaskRef}
                      className="gantt-new-input"
                      placeholder="Nova tarefa — Enter para adicionar"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      onPaste={handlePasteNewTasks}
                      onKeyDown={handleAddTask}
                    />
                  </div>
                </div>
                <div className="gantt-row-time" style={{ width: timelineWidth }} />
              </div>
            </div>
          </div>
        </div>

        {/* Alça do splitter: fora do scroller, então não rola junto */}
        <div
          className="gantt-splitter"
          style={{ left: gridWidth }}
          onMouseDown={handleSplitterDown}
          role="separator"
          aria-orientation="vertical"
          title="Arraste para redimensionar a planilha"
        />

        <GanttTooltip data={tooltip} ctx={ctx} />
      </div>

      <GanttMinimap
        tasks={tasks}
        layout={layout}
        viewport={viewport}
        gridWidth={gridWidth}
        scrollerRef={scrollerRef}
      />

      <GanttColumnMenu
        data={columnMenu}
        onClose={() => setColumnMenu(null)}
        actions={columnActions}
      />

      <GanttContextMenu
        data={contextMenu}
        onClose={() => setContextMenu(null)}
        selectionCount={selectedIds.size}
        actions={{
          openDetails: (task) => openTaskInspector(task.id),
          indent: handleIndent,
          copy: handleCopy,
          paste: handlePaste,
          duplicate: handleDuplicate,
          remove: handleDeleteSelected,
          linkSelection: handleLinkSelected,
          unlinkSelection: handleUnlinkSelected,
          selectionLinkCount: selectedDependencyCount,
          clearDependencies: (task) =>
            saveTasks([{ ...task, dependsOn: [] }], 'Remover predecessoras'),
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm?.()}
        title={confirmAction?.title}
        message={confirmAction?.message}
      />

      <GanttPrintReport
        project={activeProject}
        rows={rows}
        layout={printLayout}
        durationLabel={durationLabel}
        predecessorLabel={predecessorLabel}
        showBaseline={showBaseline}
        showBarLabels={showBarLabels}
        showCriticalPath={showCriticalPath}
        criticalIds={analysis.criticalIds}
        orientation={printOrientation}
      />
    </div>
  );
}

function GanttProjectSummaryRow({
  task,
  columns,
  gridWidth,
  layout,
  timelineWidth,
  ctx,
  showBarLabels,
}) {
  const start = viewStart(task);
  const end = viewEnd(task);
  const hasDates = Boolean(start && end);
  const progress = viewProgress(task);

  return (
    <div className="gantt-row is-project-summary is-summary" data-row="project-summary">
      <div className="gantt-row-grid" style={{ width: gridWidth }}>
        <div className="gantt-cell gantt-cell-index">
          <span className="tabular">0</span>
        </div>

        {columns.map((col) => (
          <div
            key={col.id}
            data-col={col.id}
            className={`gantt-cell is-${col.align} is-locked`}
            style={{
              width: col.width,
              flex: col.grow ? '1 1 auto' : `0 0 ${col.width}px`,
            }}
          >
            {col.id === 'name' ? (
              <span className="gantt-cell-name">
                <span className="gantt-twisty-spacer" />
                <span className="gantt-cell-text">{task.name}</span>
              </span>
            ) : (
              <span className="gantt-cell-text tabular">{col.render(task, ctx)}</span>
            )}
          </div>
        ))}
      </div>

      <div className="gantt-row-time" style={{ width: timelineWidth || layout.totalWidth }}>
        {hasDates && (
          <div
            className="gantt-project-summary-bar"
            style={{
              left: layout.xOf(start, task),
              width: layout.widthOf(start, end, task),
            }}
            title={`${formatDateTimeShort(start)} → ${formatDateTimeShort(end)} · ${progress}%`}
          >
            <span className="gantt-project-summary-fill" style={{ width: `${progress}%` }} />
            {showBarLabels && <span className="gantt-project-summary-label">{task.name}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function GanttPrintReport({
  project,
  rows,
  layout,
  durationLabel,
  predecessorLabel,
  showBaseline,
  showBarLabels,
  showCriticalPath,
  criticalIds,
  orientation,
}) {
  const tableWidth = PRINT_TABLE_W[orientation];
  const rowHeight = 22;
  const chartWidth = Math.max(1, layout.totalWidth);
  const printableRows = useMemo(() => {
    let taskNumber = 0;
    return rows.map((row) => {
      if (row.kind === 'project-summary') return { ...row, rowNumber: 0 };
      if (row.kind === 'task') {
        taskNumber += 1;
        return { ...row, rowNumber: taskNumber };
      }
      return row;
    });
  }, [rows]);

  return (
    <section
      className={`gantt-print-report print-report is-${orientation}`}
      style={{
        '--gantt-print-table-w': `${tableWidth}px`,
        '--gantt-print-chart-w': `${chartWidth}px`,
        '--gantt-print-day-w': `${layout.dayWidth}px`,
        '--gantt-print-row-h': `${rowHeight}px`,
      }}
    >
      <header className="gantt-print-cover">
        <div>
          <div className="gantt-print-brand">
            <img src="/logo-premium.svg" alt="RV Planejamento" />
            <span>Projeta</span>
          </div>
          <p className="gantt-print-kicker">Cronograma Gantt</p>
          <h1>{project?.name || 'Projeto'}</h1>
        </div>
      </header>

      <div className="gantt-print-grid">
        <div className="gantt-print-table-head">
          <span>#</span>
          <span>Tarefa</span>
          <span>Duração</span>
          <span>Início</span>
          <span>Término</span>
          <span>%</span>
          <span>Pred.</span>
        </div>

        <div className="gantt-print-time-head" style={{ width: chartWidth }}>
          <div className="gantt-print-months">
            {layout.months.map((month) => (
              <span
                key={month.key}
                style={{ width: month.days * layout.dayWidth }}
              >
                {month.days * layout.dayWidth > 42 ? month.shortLabel : ''}
              </span>
            ))}
          </div>
          <div className="gantt-print-ticks">
            {layout.ticks.map((tick) => (
              <span
                key={tick.date}
                className={tick.weekend ? 'is-weekend' : ''}
                style={{ width: tick.span * layout.dayWidth }}
              >
                {tick.span * layout.dayWidth > 18 ? Number(tick.date.slice(8, 10)) : ''}
              </span>
            ))}
          </div>
        </div>

        {printableRows.map((row) => (
          row.kind === 'group' ? (
            <React.Fragment key={row.id}>
              <div className="gantt-print-table-row is-group">
                <span />
                <span>{row.label}</span>
                <span>{row.count}</span>
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="gantt-print-time-row is-group" style={{ width: chartWidth }}>
                {row.start && row.end && (
                  <span
                    className="gantt-print-group-span"
                    style={{
                      left: layout.xOf(row.start),
                      width: layout.widthOf(row.start, row.end),
                    }}
                  />
                )}
              </div>
            </React.Fragment>
          ) : (
            <PrintTaskRow
              key={row.id}
              row={row}
              rowNumber={row.rowNumber}
              layout={layout}
              chartWidth={chartWidth}
              durationLabel={durationLabel}
              predecessorLabel={predecessorLabel}
              showBaseline={showBaseline}
              showBarLabels={showBarLabels}
              showCriticalPath={showCriticalPath}
              criticalIds={criticalIds}
            />
          )
        ))}
      </div>
    </section>
  );
}

function PrintTaskRow({
  row,
  rowNumber,
  layout,
  chartWidth,
  durationLabel,
  predecessorLabel,
  showBaseline,
  showBarLabels,
  showCriticalPath,
  criticalIds,
}) {
  const task = row.task;
  const start = viewStart(task);
  const end = viewEnd(task);
  const hasDates = Boolean(start && end);
  const progress = viewProgress(task);
  const stageClass = showCriticalPath && criticalIds.has(task.id)
    ? 'is-critical'
    : progress >= 100
    ? STAGE_MODIFIER.done
    : progress > 0
      ? STAGE_MODIFIER['in-progress']
      : STAGE_MODIFIER['not-started'];

  return (
    <React.Fragment>
      <div className={`gantt-print-table-row ${task.isSummary ? 'is-summary' : ''}`}>
        <span className="tabular">{rowNumber}</span>
        <span style={{ paddingLeft: `${Math.min(40, (task.indentLevel || 0) * 8)}px` }}>
          {task.name}
        </span>
        <span>{durationLabel(task)}</span>
        <span>{formatDateTimeShort(start)}</span>
        <span>{formatDateTimeShort(end)}</span>
        <span className="tabular">{progress}%</span>
        <span>{predecessorLabel(task.dependsOn)}</span>
      </div>

      <div className={`gantt-print-time-row ${task.isSummary ? 'is-summary' : ''}`} style={{ width: chartWidth }}>
        {showBaseline && task.baselineStart && task.baselineEnd && (
          <span
            className="gantt-print-baseline"
            style={{
              left: layout.xOf(task.baselineStart, task),
              width: layout.widthOf(task.baselineStart, task.baselineEnd, task),
            }}
          />
        )}

        {hasDates && (
          <span
            className={`gantt-print-bar ${stageClass} ${task.isSummary ? 'is-summary' : ''}`}
            style={{
              left: layout.xOf(start, task),
              width: layout.widthOf(start, end, task),
            }}
          >
            <span className="gantt-print-bar-fill" style={{ width: `${progress}%` }} />
            {showBarLabels && <span className="gantt-print-bar-label">{task.name}</span>}
          </span>
        )}
      </div>
    </React.Fragment>
  );
}
