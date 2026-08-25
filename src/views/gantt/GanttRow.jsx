import React from 'react';
import { ChevronRight, GripVertical, AlertTriangle } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { isMilestone, isManual } from '../../utils/schedule';
import {
  viewStart, viewEnd, viewProgress, stageOf, isLate,
} from '../../utils/taskState';
import { STAGE_MODIFIER } from './ganttConfig';

/* ═══════════════════════════════════════════════════════════════
   Uma linha do Gantt = células da planilha + barra, no MESMO
   elemento.

   É essa unidade que faz a SELEÇÃO atravessar as duas metades.
   Enquanto planilha e timeline eram árvores separadas, era impossível
   destacar a linha inteira.

   O realce de hover foi removido: num cronograma o ponteiro cruza
   dezenas de linhas a caminho da barra que interessa, e acender cada
   uma no caminho é ruído. Quem precisa estar visível é a seleção.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttRow({ task, index, rowNumber, ctx }) {
  const {
    columns,
    gridWidth,
    layout,
    selectedIds,
    editingCell,
    collapsedIds,
    criticalIds,
    showCriticalPath,
    showBarLabels,
    showBaseline,
    dragPreview,
    onRowMouseDown,
    onToggleTaskSelection,
    onRowClick,
    onRowDoubleClick,
    onToggleCollapse,
    onEditChange,
    onCommitEdit,
    onCancelEdit,
    onBarMouseDown,
    onResizeMouseDown,
    onBarEnter,
    onBarMove,
    onBarLeave,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
    onProgressDrag,
    onContextMenu,
    activeCell,
    analysis,
    showSlack,
    dragOverIndex,
    editValue,
    editInputRef,
  } = ctx;

  const selected = selectedIds.has(task.id);
  const critical = showCriticalPath && criticalIds.has(task.id);
  const dimmed = showCriticalPath && !critical;
  const collapsed = collapsedIds.has(task.id);

  /* Enquanto arrasta, a barra segue o cursor sem gravar no banco. */
  const preview = dragPreview?.taskId === task.id ? dragPreview : null;
  const startDate = preview?.startDate ?? viewStart(task);
  const endDate = preview?.endDate ?? viewEnd(task);

  const milestone = isMilestone({ ...task, startDate, endDate });
  const slackDays = analysis?.byId?.get(task.id)?.totalSlackDays ?? 0;
  const hasDates = Boolean(startDate && endDate);

  /* Manual: o planejador fixou as datas e o auto-agendamento não a
     move. Quando a data fixada desrespeita a predecessora, o Gantt
     avisa — e só avisa: corrigir seria desfazer a decisão dele. */
  const manual = isManual(task);
  const late = isLate({ ...task, endDate });
  const violation = analysis?.byId?.get(task.id)?.violationMinutes ?? 0;

  const rowClass = [
    'gantt-row',
    selected ? 'is-selected' : '',
    task.isSummary ? 'is-summary' : '',
    dragOverIndex === index ? 'is-drop-target' : '',
    preview ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowClass}
      data-row={index}
      onMouseDown={(e) => onRowMouseDown(e, task, index)}
      onClick={(e) => onRowClick(e, task)}
      onDoubleClick={(e) => {
        if (editingCell) return;
        e.preventDefault();
        onRowDoubleClick(e, task);
      }}
      onContextMenu={(e) => onContextMenu(e, task)}
      onDragOver={(e) => onRowDragOver(e, index)}
      onDrop={(e) => onRowDrop(e, task)}
      onDragEnd={onRowDragEnd}
    >
      {/* ── Planilha ─────────────────────────────────────────── */}
      <div className="gantt-row-grid" style={{ width: gridWidth }}>
        <div
          className="gantt-cell gantt-cell-index"
          draggable={!editingCell}
          onDragStart={(e) => onRowDragStart(e, task)}
        >
          <Checkbox
            checked={selected}
            onPointerDown={(e) => e.stopPropagation()}
            onCheckedChange={() => onToggleTaskSelection(task)}
            aria-label={`Selecionar ${task.name}`}
            className="gantt-row-select"
          />
          <GripVertical size={11} className="gantt-grip" />
          <span className="tabular">{rowNumber ?? index + 1}</span>
        </div>

        {columns.map((col) => {
          const editing =
            editingCell?.taskId === task.id && editingCell?.field === col.field;
          const locked = task.isSummary && col.summaryLocked;
          const isActive =
            activeCell?.taskId === task.id && activeCell?.colId === col.id;

          return (
            <div
              key={col.id}
              data-col={col.id}
              className={[
                'gantt-cell',
                `is-${col.align}`,
                editing ? 'is-editing' : '',
                locked ? 'is-locked' : '',
                isActive && !editing ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                width: col.width,
                flex: col.grow ? '1 1 auto' : `0 0 ${col.width}px`,
              }}
            >
              {editing ? (
                <CellEditor
                  col={col}
                  ctx={ctx}
                  value={editValue}
                  inputRef={editInputRef}
                  onChange={onEditChange}
                  onCommit={onCommitEdit}
                  onCancel={onCancelEdit}
                />
              ) : col.id === 'name' ? (
                <span
                  className="gantt-cell-name"
                  style={{ paddingLeft: (task.indentLevel || 0) * 14 }}
                >
                  {task.hasChildren ? (
                    <button
                      type="button"
                      className={`gantt-twisty ${collapsed ? '' : 'is-open'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse(task.id);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={collapsed ? 'Expandir' : 'Recolher'}
                    >
                      <ChevronRight size={12} />
                    </button>
                  ) : (
                    <span className="gantt-twisty-spacer" />
                  )}
                  <span className="gantt-cell-text">{task.name}</span>
                </span>
              ) : (
                <span className="gantt-cell-text tabular">{col.render(task, ctx)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Timeline ─────────────────────────────────────────── */}
      <div className="gantt-row-time" style={{ width: ctx.timelineWidth || layout.totalWidth }}>
        {/* Folga: quanto a tarefa pode escorregar sem empurrar o
            projeto. Fantasma logo após o término, para o atraso
            aceitável ser visível sem precisar abrir nada. */}
        {showSlack && !task.isSummary && slackDays > 0 && hasDates && (
          <div
            className="gantt-slack"
            style={{
              /* Em sub-dia a folga começa no instante exato do término;
                 em dia inteiro, na célula seguinte. */
              left: layout.xOf(endDate, task) + (layout.subday ? 0 : layout.dayWidth),
              width: slackDays * layout.dayWidth,
            }}
            title={'Folga total: ' + slackDays + ' dia(s) úteis'}
          />
        )}

        {showBaseline && task.baselineStart && task.baselineEnd && (
          <div
            className="gantt-baseline"
            style={{
              left: layout.xOf(task.baselineStart, task),
              width: layout.widthOf(task.baselineStart, task.baselineEnd, task),
            }}
          />
        )}

        {hasDates && milestone && (
          <div
            className={`gantt-milestone ${critical ? 'is-critical' : ''} ${dimmed ? 'is-dimmed' : ''} ${late ? 'is-late' : ''}`}
            style={{
              left: layout.xOf(startDate, task)
                + (layout.subday ? 0 : layout.dayWidth / 2),
            }}
            onMouseDown={(e) => onBarMouseDown(e, task)}
            onMouseEnter={(e) => onBarEnter(e, task)}
            onMouseMove={onBarMove}
            onMouseLeave={onBarLeave}
          >
            <span className="gantt-milestone-shape" />
            {showBarLabels && <span className="gantt-bar-outside-label">{task.name}</span>}
          </div>
        )}

        {hasDates && !milestone && (
          <div
            className={[
              'gantt-bar',
              task.isSummary ? 'is-summary' : STAGE_MODIFIER[stageOf(task)],
              /* Atraso é CONDIÇÃO, não estágio: entra por cima da cor
                 do estágio em vez de substituí-la, para "em andamento
                 e atrasada" — o caso que mais importa — ser legível. */
              late ? 'is-late' : '',
              critical ? 'is-critical' : '',
              dimmed ? 'is-dimmed' : '',
              manual && !task.isSummary ? 'is-manual' : '',
              violation > 0 ? 'is-violating' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: layout.xOf(startDate, task),
              width: layout.widthOf(startDate, endDate, task),
            }}
            onMouseDown={(e) => onBarMouseDown(e, task)}
            onMouseEnter={(e) => onBarEnter(e, task)}
            onMouseMove={onBarMove}
            onMouseLeave={onBarLeave}
          >
            <span
              className="gantt-bar-fill"
              style={{ width: `${viewProgress(task)}%` }}
            />
            {showBarLabels && (
              <BarLabel task={task} layout={layout} start={startDate} end={endDate} />
            )}

            {!task.isSummary && (
              <>
                {/* Alça de progresso: arrastar a fronteira do preenchimento
                    define a % sem abrir formulário nenhum. */}
                <span
                  className="gantt-progress-grip"
                  style={{ left: `${viewProgress(task)}%` }}
                  onMouseDown={(e) => onProgressDrag(e, task)}
                  title="Arrastar para ajustar o progresso"
                />
                <span
                  className="gantt-bar-handle"
                  onMouseDown={(e) => onResizeMouseDown(e, task)}
                  title="Arrastar para ajustar o término"
                />
              </>
            )}

            {violation > 0 && (
              <span
                className="gantt-violation"
                title={`Agendada manualmente antes do que a predecessora permite (${ctx.formatMinutes(violation)}).`}
              >
                <AlertTriangle size={11} strokeWidth={2.2} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Editor da célula, escolhido pelo tipo declarado na coluna.
 *
 * `datetime-local` devolve exatamente 'YYYY-MM-DDTHH:mm' — a mesma
 * string que o modelo guarda. É a razão de o instante ter esse
 * formato: o editor de data grava sem nenhuma conversão, como o
 * `type="date"` fazia antes de existir hora.
 */
function CellEditor({ col, ctx, value, inputRef, onChange, onCommit, onCancel }) {
  const onKeyDown = (e) => {
    if (e.key === 'Enter') onCommit();
    if (e.key === 'Escape') onCancel();
  };

  if (col.type === 'select') {
    const options = col.options(ctx);
    const uiValue = value || '__empty__';
    return (
      <Select
        value={uiValue}
        onValueChange={(next) => {
          const resolved = next === '__empty__' ? '' : next;
          onChange(resolved);
          onCommit(resolved);
        }}
      >
        <SelectTrigger
          ref={inputRef}
          className="gantt-cell-input is-select !h-full w-full"
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
          autoFocus
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            {options.map((opt) => (
              <SelectItem key={opt.value || '__empty__'} value={opt.value || '__empty__'}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  return (
    <input
      ref={inputRef}
      className="gantt-cell-input"
      type={
        col.type === 'datetime' ? 'datetime-local'
          : col.type === 'number' ? 'number'
            : 'text'
      }
      value={value}
      title={col.id === 'duration' ? ctx.durationInputHint : undefined}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => {
        if (col.type === 'text') e.target.select();
      }}
      onBlur={() => onCommit()}
      onKeyDown={onKeyDown}
      autoFocus
    />
  );
}

/**
 * O rótulo vai DENTRO da barra quando cabe, e do lado de fora quando
 * não cabe. Antes ele simplesmente sumia em barras curtas.
 */
function BarLabel({ task, layout, start, end }) {
  const width = layout.widthOf(start, end, task);
  const fits = width > task.name.length * 6.2 + 20;

  return fits ? (
    <span className="gantt-bar-label">{task.name}</span>
  ) : (
    <span className="gantt-bar-outside-label">{task.name}</span>
  );
}
