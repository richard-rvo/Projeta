import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { exportWorkspaceBackup } from '../utils/supabaseRepository';
import ProjectCalendarSettings from '../components/settings/ProjectCalendarSettings';
import {
  BriefcaseBusiness, CalendarDays, Download, Database, Palette, Info, Sun, Moon, UsersRound,
  RefreshCw,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — duas colunas, estilo Ajustes do macOS

   Lista de seções à esquerda, painel à direita. A versão anterior
   era uma grade de cards de vidro todos com o mesmo peso, incluindo
   "Apagar tudo" lado a lado com "Tema".
   ═══════════════════════════════════════════════════════════════ */

export default function PageSettings() {
  const {
    state, showToast, setTheme, verifyLocalSave, updateProjectPatch, updateWorkspace,
  } = useContext(AppContext);
  const [section, setSection] = useState(state.activeProjectId ? 'project' : 'workspace');
  const project = state.projects.find((item) => item.id === state.activeProjectId);
  const workspace = state.auth.workspace;
  const sections = [
    ...(project ? [
      { id: 'project', label: 'Projeto', icon: BriefcaseBusiness },
      { id: 'calendar', label: 'Calendário', icon: CalendarDays },
    ] : []),
    { id: 'workspace', label: 'Workspace e equipe', icon: UsersRound },
    { id: 'appearance', label: 'Aparência', icon: Palette },
    { id: 'data', label: 'Dados', icon: Database },
    { id: 'about', label: 'Sobre', icon: Info },
  ];

  useEffect(() => {
    if (!sections.some((item) => item.id === section)) setSection(sections[0]?.id || 'workspace');
  }, [project?.id, section, sections.length]);

  return (
    <div className="mx-auto flex max-w-4xl gap-6">
      <nav className="w-48 shrink-0">
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-body transition-colors',
                  section === s.id
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text-1'
                )}
              >
                <s.icon size={15} strokeWidth={1.8} />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {section === 'project' && project && <ProjectDetails project={project} onChange={(patch) => updateProjectPatch(project.id, patch)} />}

        {section === 'calendar' && project && (
          <ProjectCalendarSettings
            project={project}
            tasks={state.tasks.filter((task) => task.projectId === project.id)}
            onChange={(patch) => updateProjectPatch(project.id, patch)}
            showToast={showToast}
          />
        )}

        {section === 'workspace' && workspace && (
          <WorkspaceSettings workspace={workspace} user={state.auth.user} projects={state.projects.length} onChange={updateWorkspace} />
        )}

        {section === 'appearance' && (
          <Panel title="Aparência" hint="Preferências de exibição desta sessão.">
            <Row label="Tema" description="Claro para ambientes iluminados, escuro para sala de controle.">
              <Choice
                options={[
                  { id: 'light', label: 'Claro', icon: Sun },
                  { id: 'dark', label: 'Escuro', icon: Moon },
                ]}
                value={state.theme}
                onChange={setTheme}
              />
            </Row>
          </Panel>
        )}

        {section === 'data' && (
          <>
            <Panel
              title="Salvamento"
              hint="Projetos, tarefas e anomalias são gravados automaticamente no workspace Supabase."
            >
              <Row
                label="Estado remoto"
                description="Confere se os dados exibidos estão iguais aos dados guardados no workspace."
              >
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await verifyLocalSave();
                      showToast('Dados remotos conferidos', 'success');
                    } catch (error) {
                      showToast(error?.message || 'Falha ao conferir salvamento', 'error');
                    }
                  }}
                >
                  <RefreshCw data-icon="inline-start" />
                  Conferir
                </Button>
              </Row>
            </Panel>

            <Panel
              title="Backup"
              hint="O backup é uma cópia JSON para arquivo. A fonte oficial continua sendo o workspace remoto."
            >
              <Row label="Exportar" description="Baixa um JSON com projetos, tarefas e anomalias.">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      exportWorkspaceBackup(state);
                      showToast('Backup exportado', 'success');
                    } catch (err) {
                      showToast(`Erro ao exportar: ${err.message}`, 'error');
                    }
                  }}
                >
                  <Download data-icon="inline-start" />
                  Exportar
                </Button>
              </Row>
            </Panel>
          </>
        )}

        {section === 'about' && (
          <Panel title="Sobre">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
              <dt className="text-text-3">Produto</dt>
              <dd className="text-text-1">Projeta — gestão de projetos</dd>
              <dt className="text-text-3">Armazenamento</dt>
              <dd className="text-text-1">Supabase — workspace compartilhado</dd>
              <dt className="text-text-3">Projetos</dt>
              <dd className="tabular-nums text-text-1">{state.projects.length}</dd>
              <dt className="text-text-3">Tarefas</dt>
              <dd className="tabular-nums text-text-1">{state.tasks.length}</dd>
              <dt className="text-text-3">Anomalias</dt>
              <dd className="tabular-nums text-text-1">{state.anomalies.length}</dd>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-small leading-relaxed text-text-2">
              O acesso é protegido por autenticação e as permissões são aplicadas no banco por workspace.
            </p>
          </Panel>
        )}
      </div>

    </div>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

function Panel({ title, hint, tone, children }) {
  return (
    <section
      className={cn(
        'mb-4 rounded-[8px] border bg-surface-1 p-4',
        tone === 'danger' ? 'border-sched-late/35' : 'border-line'
      )}
    >
      <h2 className={cn(
        'text-body font-semibold tracking-tight',
        tone === 'danger' ? 'text-sched-late' : 'text-text-1'
      )}>
        {title}
      </h2>
      {hint && <p className="mt-1 text-small leading-relaxed text-text-2">{hint}</p>}
      <div className="mt-3 flex flex-col divide-y divide-[var(--line-hairline)]">{children}</div>
    </section>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-text-1">{label}</div>
        {description && (
          <p className="mt-0.5 text-small leading-relaxed text-text-2">{description}</p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      size="sm"
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.id}
          value={opt.id}
        >
          <opt.icon data-icon="inline-start" />
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ProjectDetails({ project, onChange }) {
  const [draft, setDraft] = useState(project);
  useEffect(() => setDraft(project), [project]);
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const save = (field) => onChange({ [field]: draft[field] });

  return (
    <div className="flex flex-col gap-5">
      <section className="border-b border-line pb-5">
        <p className="text-micro font-semibold uppercase tracking-[0.16em] text-brand">Configuração do projeto</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-text-1">Identidade e planejamento</h2>
        <p className="mt-1 max-w-2xl text-small leading-relaxed text-text-2">Defina os dados que aparecem no portfólio e a janela geral do cronograma.</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do projeto" className="sm:col-span-2"><input value={draft.name || ''} onChange={(event) => set('name', event.target.value)} onBlur={() => save('name')} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-body text-text-1" /></Field>
        <Field label="Descrição" className="sm:col-span-2"><textarea value={draft.description || ''} onChange={(event) => set('description', event.target.value)} onBlur={() => save('description')} rows={4} className="w-full resize-y rounded-[6px] border border-line bg-surface-0 px-3 py-2 text-body text-text-1" /></Field>
        <Field label="Início"><input type="date" value={draft.startDate || ''} onChange={(event) => set('startDate', event.target.value)} onBlur={() => save('startDate')} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-small text-text-1" /></Field>
        <Field label="Término"><input type="date" value={draft.endDate || ''} onChange={(event) => set('endDate', event.target.value)} onBlur={() => save('endDate')} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-small text-text-1" /></Field>
        <Field label="Status"><select value={draft.status || 'Planejado'} onChange={(event) => { set('status', event.target.value); onChange({ status: event.target.value }); }} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-small text-text-1"><option>Planejado</option><option>Em Andamento</option><option>Concluído</option><option>Pausado</option></select></Field>
      </div>
    </div>
  );
}

function WorkspaceSettings({ workspace, user, projects, onChange }) {
  const [draft, setDraft] = useState(workspace);
  useEffect(() => setDraft(workspace), [workspace]);
  const save = (field) => onChange({ [field]: draft[field] });
  return (
    <div className="flex flex-col gap-5">
      <section className="border-b border-line pb-5">
        <p className="text-micro font-semibold uppercase tracking-[0.16em] text-brand">Estrutura SaaS</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-text-1">Workspace e equipe</h2>
        <p className="mt-1 max-w-2xl text-small leading-relaxed text-text-2">O workspace é o limite de dados do produto. Todos os projetos, tarefas e anomalias pertencem a ele.</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do workspace"><input value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => save('name')} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-body text-text-1" /></Field>
        <Field label="Fuso horário"><select value={draft.timezone || 'America/Fortaleza'} onChange={(event) => { setDraft({ ...draft, timezone: event.target.value }); onChange({ timezone: event.target.value }); }} className="h-10 w-full rounded-[6px] border border-line bg-surface-0 px-3 text-small text-text-1"><option value="America/Fortaleza">America/Fortaleza</option><option value="America/Sao_Paulo">America/Sao_Paulo</option><option value="America/Manaus">America/Manaus</option><option value="UTC">UTC</option></select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Seu papel" value={workspace.owner_id === user?.id ? 'Owner' : 'Member'} />
        <Stat label="Projetos" value={projects} />
        <Stat label="Proteção" value="RLS ativo" />
      </div>
      <p className="border-t border-line pt-4 text-small leading-relaxed text-text-2">A gestão de convites e membros será feita por este workspace. O owner é o único responsável por alterar a equipe.</p>
    </div>
  );
}

function Field({ label, className = '', children }) {
  return <label className={`flex flex-col gap-1.5 text-small font-medium text-text-2 ${className}`}>{label}{children}</label>;
}

function Stat({ label, value }) {
  return <div className="rounded-[8px] border border-line bg-surface-1 p-3"><p className="text-micro uppercase tracking-wide text-text-3">{label}</p><p className="mt-1 text-body font-semibold text-text-1">{value}</p></div>;
}
