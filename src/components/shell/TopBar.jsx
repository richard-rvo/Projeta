import React, { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { exportWorkspaceBackup } from '@/utils/supabaseRepository';
import ProjectDialog from '@/components/ProjectDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Check,
  Pencil,
} from 'lucide-react';

const GLOBAL_TITLES = {
  pagePortfolio: 'Portfólio',
  pageAnomalies: 'Anomalias',
  pageReports: 'Relatórios',
  pageSettings: 'Configurações',
};

/**
 * A ÚNICA barra de contexto do app.
 *
 * Antes o mesmo contexto aparecia três vezes: breadcrumb no header,
 * tab bar do workspace e um <h2> na toolbar da página. Aqui é uma
 * linha só — identidade à esquerda, views no centro, busca à direita.
 */
export default function TopBar() {
  const {
    state, selectProject, toggleCommandPalette,
    updateProject, showToast, navigate, verifyLocalSave, signOut,
  } =
    useContext(AppContext);
  const [editOpen, setEditOpen] = useState(false);

  const insideProject = state.activePage === 'pageProjectWorkspace';
  const project = state.projects.find((p) => p.id === state.activeProjectId);

  const saveProject = async (fields) => {
    await updateProject({
      ...project,
      ...fields,
      updatedAt: new Date().toISOString(),
    });
    showToast('Projeto atualizado', 'success');
  };

  const verifySave = async () => {
    try {
      await verifyLocalSave();
      showToast('Workspace conferido', 'success');
    } catch (error) {
      showToast(error?.message || 'Falha ao conferir salvamento', 'error');
    }
  };

  const exportBackup = async () => {
    try {
      exportWorkspaceBackup(state);
      showToast('Backup exportado', 'success');
    } catch (error) {
      showToast(`Erro ao exportar: ${error.message}`, 'error');
    }
  };

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-[var(--overlay-material)] px-3 backdrop-blur-[var(--overlay-blur)]">
      {insideProject && project ? (
        <ProjectIdentity
          project={project}
          projects={state.projects}
          onSelect={selectProject}
          onEdit={() => setEditOpen(true)}
        />
      ) : (
        <h1 className="shrink-0 pl-2 text-[17px] font-semibold tracking-tight text-text-1">
          {GLOBAL_TITLES[state.activePage] || 'Projeta'}
        </h1>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SaveStatus
          save={state.save}
          onVerify={verifySave}
          onExport={exportBackup}
          onOpenSettings={() => navigate('pageSettings')}
        />
        <Button
          type="button"
          onClick={() => toggleCommandPalette(true)}
          variant="outline"
          size="sm"
        >
          <Search data-icon="inline-start" />
          <span className="hidden sm:inline">Pesquisar</span>
          <kbd className="hidden rounded-[4px] bg-surface-3 px-1.5 py-0.5 text-micro font-medium text-text-3 sm:inline">
            ⌘K
          </kbd>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={signOut} title="Sair">
          Sair
        </Button>
      </div>
      </header>

      <ProjectDialog
        open={editOpen && Boolean(project)}
        onOpenChange={setEditOpen}
        project={project}
        onSave={saveProject}
      />
    </>
  );
}

/* ── Salvamento remoto ────────────────────────────────────────── */

function formatSavedTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function SaveStatus({ save, onVerify, onExport, onOpenSettings }) {
  const status = save?.status || 'saved';
  const isBusy = status === 'saving' || status === 'checking';
  const savedTime = formatSavedTime(save?.lastSavedAt);

  const copy = {
    saving: {
      label: 'Salvando...',
      detail: 'Gravando alterações no workspace Supabase.',
      Icon: Loader2,
      tone: 'text-text-2',
    },
    checking: {
      label: 'Verificando...',
      detail: 'Conferindo os dados em tela com o workspace remoto.',
      Icon: RefreshCw,
      tone: 'text-text-2',
    },
    error: {
      label: 'Falha ao salvar',
      detail: save?.error || 'A última gravação remota não foi concluída.',
      Icon: CircleAlert,
      tone: 'text-sched-late',
    },
    saved: {
      label: savedTime ? `Salvo ${savedTime}` : 'Salvo no workspace',
      detail: 'As alterações são gravadas automaticamente no Supabase.',
      Icon: CircleCheck,
      tone: 'text-sched-done',
    },
  }[status] || {
    label: 'Salvo no workspace',
    detail: 'As alterações são gravadas automaticamente no Supabase.',
    Icon: CircleCheck,
    tone: 'text-sched-done',
  };

  const Icon = copy.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={status === 'error' ? 'destructiveGhost' : 'ghost'}
          size="sm"
          className="min-w-8 px-2 md:min-w-[8.75rem] md:justify-start"
          title={copy.detail}
          aria-label={copy.label}
        >
          <Icon
            data-icon="inline-start"
            className={cn(copy.tone, isBusy && 'animate-spin')}
          />
          <span className="hidden md:inline">{copy.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <span className="flex items-center gap-2">
            <Icon className={cn(copy.tone, isBusy && 'animate-spin')} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text-1">{copy.label}</span>
              <span className="block text-xs font-normal normal-case leading-snug text-text-2">
                {copy.detail}
              </span>
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => { void onVerify(); }}>
            <RefreshCw />
            Conferir salvamento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void onExport(); }}>
            <Download />
            Exportar backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSettings}>
            <Settings />
            Abrir dados e backup
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Identidade do projeto + troca rápida ────────────────────────── */

function ProjectIdentity({ project, projects, onSelect, onEdit }) {
  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      <Button
        type="button"
        onClick={() => onSelect(null)}
        title="Voltar ao portfólio"
        variant="ghost"
        size="icon-sm"
      >
        <ChevronLeft />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="min-w-0 max-w-72">
            <span className="truncate text-[15px] font-semibold tracking-tight text-text-1">
              {project.name}
            </span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
            Projeto
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Editar dados do projeto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
            Trocar de projeto
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)}>
                <Check className={cn(p.id === project.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
