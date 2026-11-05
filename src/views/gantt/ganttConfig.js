/* ═══════════════════════════════════════════════════════════════
   GANTT — configuração declarativa
   ═══════════════════════════════════════════════════════════════

   Colunas, zoom e geometria moram aqui e em nenhum outro lugar.

   A altura de linha vem do token --gantt-row-h, então densidade e
   Gantt não podem divergir. O valor duplicado em JS (ROW_H) existe
   só para o posicionamento das setas de dependência, que é calculado
   em JS — e por isso precisa espelhar o token exatamente.
   ═══════════════════════════════════════════════════════════════ */

import {
  formatDateTimeShort,
  scheduleModeOf,
  SCHEDULE_MODES,
  CONSTRAINT_TYPES,
  CONSTRAINT_NONE,
} from '../../utils/schedule';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import {
  viewStart, viewEnd, viewProgress, stageLabel, isLate,
} from '../../utils/taskState';

/* ── Zoom ──────────────────────────────────────────────────────── */

export const ZOOM_LEVELS = [
  { id: 'day', label: 'Dia', dayWidth: 32 },
  { id: 'week', label: 'Semana', dayWidth: 13 },
  { id: 'month', label: 'Mês', dayWidth: 4 },
];

export const MIN_DAY_W = 1.5;
export const MAX_DAY_W = 90;

/**
 * A granularidade do eixo decorre da largura do dia, não de um preset.
 * É o que permite zoom contínuo — "ajustar ao projeto" e ⌘+scroll
 * produzem larguras que nenhum preset teria.
 */
export function tickForDayWidth(dayWidth) {
  if (dayWidth >= SUBDAY_MIN_DAY_W) return 'day';
  if (dayWidth >= 7) return 'week';
  return 'month';
}

/**
 * A partir desta largura de dia a barra passa a mostrar a HORA: uma
 * tarefa das 13:00 às 17:00 ocupa a parte direita da célula do dia, e
 * o arrasto encaixa em 15 minutos.
 *
 * Abaixo dela a barra volta a ocupar dias inteiros — a fração de um
 * dia com 6px de largura seria um traço invisível, não informação.
 */
export const SUBDAY_MIN_DAY_W = 18;

/** Encaixe do arrasto quando a barra está em modo sub-dia. */
export const DRAG_SNAP_MINUTES = 15;

/** Nenhuma barra fica mais fina que isto, para marco e tarefa de
 *  poucas horas continuarem clicáveis. */
export const MIN_BAR_W = 5;

/** Preset mais próximo, para o segmented control acender o certo. */
export function nearestZoomId(dayWidth) {
  return ZOOM_LEVELS.reduce((best, z) =>
    Math.abs(z.dayWidth - dayWidth) < Math.abs(best.dayWidth - dayWidth) ? z : best
  ).id;
}

/* ── Geometria ─────────────────────────────────────────────────── */

export const MONTH_BAND_H = 24;
export const TICK_BAND_H = 28;
export const HEADER_H = MONTH_BAND_H + TICK_BAND_H;

export const MIN_GRID_W = 280;
export const MAX_GRID_W = 1200;
export const DEFAULT_GRID_W = 920;
export const SPLITTER_W = 5;

/** Altura padrão da linha do Gantt. Densidades menores derivam dela. */
export const ROW_H = 40;

export const DEFAULT_GANTT_DENSITY = 'comfortable';
export const GANTT_DENSITIES = [
  {
    id: 'comfortable',
    label: 'Normal',
    rowH: 40,
    textBody: '0.8125rem',
    textSmall: '0.75rem',
    textMicro: '0.6875rem',
    cellPadding: 8,
  },
  {
    id: 'compact',
    label: 'Compacto',
    rowH: 32,
    textBody: '0.75rem',
    textSmall: '0.6875rem',
    textMicro: '0.625rem',
    cellPadding: 6,
  },
  {
    id: 'condensed',
    label: 'Mini',
    rowH: 26,
    textBody: '0.6875rem',
    textSmall: '0.625rem',
    textMicro: '0.5625rem',
    cellPadding: 5,
  },
];

export function ganttDensityById(id) {
  return GANTT_DENSITIES.find((density) => density.id === id) || GANTT_DENSITIES[0];
}

/* ── Estados ───────────────────────────────────────────────────── */

/* Estágio e atraso são DERIVADOS — ver utils/taskState.js. O enum
   `status` que existia aqui misturava os dois eixos e por isso mentia
   nos dois: 'Concluída' podia conviver com 0%, e 'Atrasada' nunca era
   atribuída por ninguém. */

/** Classe modificadora da barra por estágio — a cor vem do CSS. */
export const STAGE_MODIFIER = {
  'not-started': 'is-not-started',
  'in-progress': 'is-on-track',
  done: 'is-done',
};

export const SCHEDULE_MODE_OPTIONS = [
  { value: SCHEDULE_MODES.AUTO, label: 'Automática' },
  { value: SCHEDULE_MODES.MANUAL, label: 'Manual' },
];

export const CONSTRAINT_OPTIONS = CONSTRAINT_TYPES.map((c) => ({
  value: c.id,
  label: c.label,
}));

/* ── Colunas ───────────────────────────────────────────────────────
   Fonte única para o cabeçalho e para as células. A view Tabela
   consome a mesma lista, o que elimina a divergência que havia entre
   o Gantt e a lista de tarefas.

   · field    — propriedade da tarefa
   · render   — texto exibido
   · editable — aceita edição inline
   · type     — text | number | datetime | select
   · options  — (ctx) => [{ value, label }], só para select
   · maxLength — limite do banco para o texto editado inline
   · summaryLocked — calculado em tarefa-resumo, não editável
   ─────────────────────────────────────────────────────────────── */

export const COLUMNS = [
  {
    id: 'name',
    label: 'Nome da tarefa',
    field: 'name',
    width: 380,
    grow: true,
    align: 'left',
    editable: true,
    type: 'text',
    maxLength: 500,
    alwaysOn: true,
    render: (t) => t.name,
  },
  {
    id: 'duration',
    label: 'Duração',
    field: 'duration',
    width: 72,
    align: 'center',
    editable: true,
    /* Texto, não número: a duração aceita `3d`, `4h` e `90m`. Um
       <input type="number"> descarta a unidade em silêncio — digitar
       "4h" chega ao commit como string vazia e nada acontece. */
    type: 'text',
    summaryLocked: true,
    render: (t, ctx) => ctx.durationLabel(t),
  },
  {
    id: 'start',
    label: 'Início',
    field: 'startDate',
    width: 118,
    align: 'center',
    editable: true,
    type: 'datetime',
    summaryLocked: true,
    render: (t) => formatDateTimeShort(viewStart(t)),
  },
  {
    id: 'end',
    label: 'Término',
    field: 'endDate',
    width: 118,
    align: 'center',
    editable: true,
    type: 'datetime',
    summaryLocked: true,
    render: (t) => formatDateTimeShort(viewEnd(t)),
  },
  {
    id: 'progress',
    label: '%',
    field: 'progress',
    width: 58,
    align: 'center',
    editable: true,
    type: 'number',
    summaryLocked: true,
    render: (t) => `${viewProgress(t)}%`,
  },
  {
    /* Derivada: não é editável porque editar estado é editar progresso.
       Fora da ordem padrão — quem quiser a acrescenta pelo "+". */
    id: 'stage',
    label: 'Estado',
    field: 'progress',
    width: 108,
    align: 'left',
    editable: false,
    type: 'text',
    render: (t) => (isLate(t) ? `${stageLabel(t)} · atrasada` : stageLabel(t)),
  },
  {
    id: 'planned',
    label: '% Plan.',
    field: 'plannedProgress',
    width: 62,
    align: 'center',
    editable: false,
    type: 'text',
    render: (t) => `${calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd)}%`,
  },
  {
    id: 'dependencies',
    label: 'Pred.',
    field: 'dependsOn',
    width: 116,
    align: 'left',
    editable: true,
    type: 'text',
    render: (t, ctx) => ctx.predecessorLabel(t.dependsOn),
  },
  {
    id: 'mode',
    label: 'Modo',
    field: 'scheduleMode',
    width: 96,
    align: 'left',
    editable: true,
    type: 'select',
    summaryLocked: true,
    options: () => SCHEDULE_MODE_OPTIONS,
    render: (t) =>
      scheduleModeOf(t) === SCHEDULE_MODES.MANUAL ? 'Manual' : 'Automática',
  },
  {
    id: 'calendar',
    label: 'Calendário',
    field: 'calendarId',
    width: 118,
    align: 'left',
    editable: true,
    type: 'select',
    /* Vazio herda o do projeto — que é o caso da esmagadora maioria
       das tarefas, e o motivo de a opção em branco vir primeiro. */
    options: (ctx) => [
      { value: '', label: `Do projeto (${ctx.projectCalendarName})` },
      ...ctx.calendars.map((c) => ({ value: c.id, label: c.name })),
    ],
    render: (t, ctx) => ctx.calendarLabel(t),
  },
  {
    /* Tipo e data em colunas separadas, como no MS Project: uma célula
       só não representa os dois, e o tipo sozinho já é a informação que
       o planejador varre a coluna procurando. */
    id: 'constraintType',
    label: 'Restrição',
    field: 'constraintType',
    width: 150,
    align: 'left',
    editable: true,
    type: 'select',
    summaryLocked: true,
    options: () => CONSTRAINT_OPTIONS,
    render: (t) => (CONSTRAINT_TYPES.find(
      (c) => c.id === (t.constraintType || CONSTRAINT_NONE)
    )?.label ?? ''),
  },
  {
    id: 'constraintDate',
    label: 'Data da restrição',
    field: 'constraintDate',
    width: 130,
    align: 'center',
    editable: true,
    type: 'datetime',
    summaryLocked: true,
    render: (t) => (t.constraintType && t.constraintType !== CONSTRAINT_NONE
      ? formatDateTimeShort(t.constraintDate)
      : ''),
  },
  {
    id: 'resources',
    label: 'Recursos',
    field: 'resources',
    width: 120,
    align: 'left',
    editable: true,
    type: 'text',
    render: (t) => t.resources || '',
  },
  {
    id: 'resourceGroup',
    label: 'Grupo',
    field: 'resourceGroup',
    width: 110,
    align: 'left',
    editable: true,
    type: 'text',
    render: (t) => t.resourceGroup || '',
  },
  {
    id: 'baselineStart',
    label: 'Início base',
    field: 'baselineStart',
    width: 118,
    align: 'center',
    editable: true,
    type: 'datetime',
    render: (t) => formatDateTimeShort(t.baselineStart),
  },
  {
    id: 'baselineEnd',
    label: 'Fim base',
    field: 'baselineEnd',
    width: 118,
    align: 'center',
    editable: true,
    type: 'datetime',
    render: (t) => formatDateTimeShort(t.baselineEnd),
  },
];

/* ── Layout de colunas, por projeto ───────────────────────────────
   Uma ÚNICA lista define quais colunas aparecem E em que ordem.
   Antes havia um mapa de visibilidade separado da ordem, o que
   tornava "inserir aqui" impossível de representar.

   `name` é sempre a primeira e não pode ser removida: sem ela a
   planilha vira uma tabela de números sem assunto.               */

export const DEFAULT_COLUMN_ORDER = ['name', 'duration', 'start', 'end', 'progress', 'dependencies'];

const LAYOUT_KEY = (projectId) => `projeta_gantt_cols_${projectId}`;

export function loadColumnLayout(projectId) {
  const fallback = { order: [...DEFAULT_COLUMN_ORDER], widths: {} };
  if (!projectId) return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY(projectId)));
    if (!saved?.order?.length) return fallback;
    /* Descarta ids que não existem mais e garante `name` na frente. */
    const known = new Set(COLUMNS.map((col) => col.id));
    const order = saved.order.filter((id) => known.has(id));
    if (!order.includes('name')) order.unshift('name');
    return { order, widths: saved.widths || {} };
  } catch {
    return fallback;
  }
}

export function saveColumnLayout(projectId, layout) {
  if (!projectId) return;
  try {
    localStorage.setItem(LAYOUT_KEY(projectId), JSON.stringify(layout));
  } catch {
    /* modo privado — seguir sem persistir */
  }
}

export const MIN_COL_W = 44;
export const MAX_COL_W = 640;
