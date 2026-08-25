import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarButton } from '../shell/ViewBar';
import ConfirmDialog from '../ConfirmDialog';
import AnomalyForm from './AnomalyForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select as UiSelect, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Plus, Search, AlertTriangle, Trash2, PenLine, X, MapPin, Wrench, Hash,
} from 'lucide-react';
import {
  SEVERITY_OPTIONS, SEVERITY_DOT,
  STATUS_OPTIONS, EMPTY_ANOMALY, formatDatetime,
} from './anomalyConfig';

const SEVERITY_VARIANT = {
  baixa: 'onTrack', média: 'atRisk', alta: 'late', crítica: 'critical',
};

const STATUS_VARIANT = {
  aberta: 'late', 'em análise': 'atRisk', resolvida: 'done', cancelada: 'neutral',
};

/* ═══════════════════════════════════════════════════════════════
   Split view de anomalias: lista densa à esquerda, detalhe à direita.

   Uma grade de cards forçava a ler tudo para achar uma. A lista
   densa deixa varrer dezenas de registros de relance, e o painel de
   detalhe abre sem tirar o contexto da tela.

   Serve às DUAS telas — a central global e a do projeto. A diferença
   é só se a coluna "projeto" aparece e se dá para registrar.
   ═══════════════════════════════════════════════════════════════ */

export default function AnomalyBoard({
  anomalies,
  tasks = [],
  projects = [],
  showProject = false,
  canCreate = true,
  onCreate,
  onUpdate,
  onDelete,
  onError,
}) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('todas');
  const [status, setStatus] = useState('todos');
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(EMPTY_ANOMALY);
  const [confirmId, setConfirmId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return anomalies
      .filter((a) => {
        if (term && !`${a.title} ${a.equipment || ''} ${a.location || ''}`.toLowerCase().includes(term)) return false;
        if (severity !== 'todas' && a.severity !== severity) return false;
        if (status !== 'todos' && a.status !== status) return false;
        return true;
      })
      .sort((a, b) => String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')));
  }, [anomalies, query, severity, status]);

  const selected = filtered.find((a) => a.id === selectedId) || null;
  const openCount = anomalies.filter((a) => a.status === 'aberta').length;

  const projectName = (id) => projects.find((p) => p.id === id)?.name || '';
  const taskName = (id) => tasks.find((t) => t.id === id)?.name || '';

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <label className="relative flex items-center">
          <Search size={14} strokeWidth={1.8} className="absolute left-2.5 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, equipamento ou local"
            className="h-7.5 w-72 rounded-[6px] border border-line bg-surface-0 pl-8 pr-2.5 text-small text-text-1 placeholder:text-text-3 focus:border-line-strong"
          />
        </label>

        <FilterSelect value={severity} onChange={setSeverity}
          options={[{ v: 'todas', l: 'Toda severidade' }, ...SEVERITY_OPTIONS.map((s) => ({ v: s, l: s }))]} />
        <FilterSelect value={status} onChange={setStatus}
          options={[{ v: 'todos', l: 'Todo status' }, ...STATUS_OPTIONS.map((s) => ({ v: s, l: s }))]} />

        <span className="ml-1 text-micro tabular-nums text-text-3">
          {filtered.length} de {anomalies.length}
          {openCount > 0 && <span className="ml-2 text-sched-late">{openCount} aberta(s)</span>}
        </span>

        <div className="ml-auto" />
        {canCreate && (
          <ViewBarButton
            icon={Plus}
            variant="primary"
            onClick={() => { setEditing({ ...EMPTY_ANOMALY }); setFormOpen(true); }}
          >
            Registrar
          </ViewBarButton>
        )}
      </ViewBar>

      <div className="flex min-h-0 flex-1">
        {/* ── Lista ──────────────────────────────────────────────── */}
        <div className={cn(
          'min-h-0 overflow-auto border-r border-line',
          selected ? 'w-[420px] shrink-0' : 'flex-1'
        )}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <AlertTriangle size={40} strokeWidth={1.2} className="text-text-3" />
              <div>
                <h3 className="text-read font-semibold text-text-1">Nenhuma anomalia</h3>
                <p className="mt-1 text-small text-text-2">
                  {anomalies.length ? 'Ajuste os filtros.' : 'Nada registrado até agora.'}
                </p>
              </div>
            </div>
          ) : (
            <ul>
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors',
                      a.id === selectedId ? 'bg-brand-soft' : 'hover:bg-surface-2'
                    )}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[a.severity])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-text-1">{a.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-text-3">
                        {showProject && projectName(a.projectId) && (
                          <span className="truncate">{projectName(a.projectId)}</span>
                        )}
                        {a.equipment && <span className="truncate">{a.equipment}</span>}
                        <span className="tabular-nums">{formatDatetime(a.reportedAt)}</span>
                      </span>
                    </span>
                    <Badge variant={STATUS_VARIANT[a.status] || 'neutral'}>
                      {a.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Detalhe ────────────────────────────────────────────── */}
        {selected && (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant={SEVERITY_VARIANT[selected.severity] || 'neutral'}>
                    {selected.severity}
                  </Badge>
                  <Badge variant={STATUS_VARIANT[selected.status] || 'neutral'}>
                    {selected.status}
                  </Badge>
                  {selected.type && (
                    <Badge variant="secondary">{selected.type}</Badge>
                  )}
                </div>
                <h2 className="text-title font-semibold leading-tight tracking-tight text-text-1">
                  {selected.title}
                </h2>
              </div>

              <div className="flex shrink-0 gap-1">
                <IconBtn title="Editar" onClick={() => { setEditing({ ...EMPTY_ANOMALY, ...selected }); setFormOpen(true); }}>
                  <PenLine size={14} />
                </IconBtn>
                <IconBtn title="Excluir" danger onClick={() => setConfirmId(selected.id)}>
                  <Trash2 size={14} />
                </IconBtn>
                <IconBtn title="Fechar" onClick={() => setSelectedId(null)}>
                  <X size={14} />
                </IconBtn>
              </div>
            </header>

            {selected.description && (
              <p className="mt-3 whitespace-pre-wrap text-body leading-relaxed text-text-1">
                {selected.description}
              </p>
            )}

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-small">
              {showProject && <Detail label="Projeto" value={projectName(selected.projectId)} />}
              <Detail label="Registrado por" value={selected.reportedBy} />
              <Detail label="Em" value={formatDatetime(selected.reportedAt)} />
              {selected.taskId && <Detail label="Tarefa" value={taskName(selected.taskId)} />}
              {selected.osNumber && <Detail label="OS" value={selected.osNumber} icon={Hash} />}
              {selected.equipment && <Detail label="Equipamento" value={selected.equipment} icon={Wrench} />}
              {selected.location && <Detail label="Local" value={selected.location} icon={MapPin} />}
              {selected.discipline && <Detail label="Disciplina" value={selected.discipline} />}
              {selected.rootCause && <Detail label="Causa raiz" value={selected.rootCause} />}
              {selected.correctiveAction && <Detail label="Ação corretiva" value={selected.correctiveAction} />}
              {selected.resolvedAt && <Detail label="Resolvida em" value={formatDatetime(selected.resolvedAt)} />}
            </dl>

            {selected.photos?.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-micro font-semibold uppercase tracking-wide text-text-3">
                  Fotos ({selected.photos.length})
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                  {selected.photos.map((src, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(src)}
                      className="aspect-square overflow-hidden rounded-[8px] border border-line transition-opacity hover:opacity-85">
                      <img src={src} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mudança de status direto do detalhe: é a ação mais
                frequente e não merece abrir o formulário inteiro. */}
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-micro font-semibold uppercase tracking-wide text-text-3">
                Alterar status
              </h3>
              <ToggleGroup
                type="single"
                value={selected.status}
                onValueChange={(next) => {
                  if (!next || next === selected.status) return;
                  onUpdate({
                    ...selected,
                    status: next,
                    resolvedAt: next === 'resolvida' ? new Date().toISOString() : null,
                  });
                }}
                size="sm"
                aria-label="Status da anomalia"
              >
                {STATUS_OPTIONS.map((s) => (
                  <ToggleGroupItem key={s} value={s}>
                    {s}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        )}
      </div>

      <AnomalyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        tasks={tasks}
        onError={onError}
        onSave={async (data) => {
          try {
            const saved = data.id ? await onUpdate(data) : await onCreate(data);
            setFormOpen(false);
            if (saved?.id) setSelectedId(saved.id);
          } catch (error) {
            onError?.(error?.message || 'Não foi possível salvar a anomalia e suas imagens.');
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={async () => { await onDelete(confirmId); setSelectedId(null); setConfirmId(null); }}
        title="Excluir anomalia"
        message="A anomalia e suas fotos serão removidas definitivamente."
      />

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-[10px] object-contain" />
        </div>
      )}
    </div>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

function FilterSelect({ value, onChange, options }) {
  return (
    <UiSelect value={value} onValueChange={onChange}>
      <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </UiSelect>
  );
}

function Detail({ label, value, icon: Icon }) {
  return (
    <>
      <dt className="flex items-center gap-1 whitespace-nowrap text-text-3">
        {Icon && <Icon size={11} strokeWidth={1.8} />} {label}
      </dt>
      <dd className="text-text-1">{value || '—'}</dd>
    </>
  );
}

function IconBtn({ title, danger, children, ...props }) {
  return (
    <Button
      type="button"
      title={title}
      variant={danger ? 'destructiveGhost' : 'ghost'}
      size="icon-sm"
      {...props}
    >
      {children}
    </Button>
  );
}
