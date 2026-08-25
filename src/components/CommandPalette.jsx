import React, { useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { PROJECT_VIEWS } from './shell/projectViews';
import {
  LayoutGrid,
  AlertTriangle,
  FileBarChart,
  Settings,
  Folder,
  CheckSquare,
} from 'lucide-react';

const NAV_COMMANDS = [
  { id: 'pagePortfolio', label: 'Portfólio', icon: LayoutGrid },
  { id: 'pageAnomalies', label: 'Central de Anomalias', icon: AlertTriangle },
  { id: 'pageReports', label: 'Relatórios', icon: FileBarChart },
  { id: 'pageSettings', label: 'Configurações', icon: Settings },
];

/**
 * Command palette (⌘K) sobre o primitivo Command do shadcn (cmdk).
 *
 * A versão anterior era filtro e navegação de teclado escritos à mão.
 * O cmdk resolve pontuação de busca, navegação por setas, foco e
 * acessibilidade — e ganhamos as ações da view ativa de brinde.
 */
export default function CommandPalette() {
  const {
    state,
    toggleCommandPalette,
    selectProject,
    setProjectTab,
    navigate,
    openTaskInspector,
    setTheme,
  } = useContext(AppContext);

  const { isCommandPaletteOpen, projects, tasks, anomalies, activeProjectId } = state;
  const insideProject = state.activePage === 'pageProjectWorkspace' && activeProjectId;

  /* ⌘K / Ctrl+K global */
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCommandPalette]);

  const run = (fn) => () => {
    fn();
    toggleCommandPalette(false);
  };

  /* Tarefas do projeto aberto primeiro — é onde a busca costuma mirar. */
  const rankedTasks = [...tasks]
    .sort((a, b) => {
      const aIn = a.projectId === activeProjectId ? 0 : 1;
      const bIn = b.projectId === activeProjectId ? 0 : 1;
      return aIn - bIn;
    })
    .slice(0, 40);

  return (
    <CommandDialog
      open={isCommandPaletteOpen}
      onOpenChange={(open) => toggleCommandPalette(open)}
      title="Comandos"
      description="Busque projetos, tarefas, anomalias ou execute uma ação"
    >
      <CommandInput placeholder="Buscar projetos, tarefas, anomalias ou comandos…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>

        {insideProject && (
          <>
            <CommandGroup heading="Ir para">
              {PROJECT_VIEWS.map((view) => (
                <CommandItem
                  key={view.id}
                  value={`view ${view.label}`}
                  onSelect={run(() => setProjectTab(view.id))}
                >
                  <view.icon size={15} strokeWidth={1.8} />
                  <span>{view.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navegação">
          {NAV_COMMANDS.map((item) => (
            <CommandItem
              key={item.id}
              value={`navegar ${item.label}`}
              onSelect={run(() => navigate(item.id))}
            >
              <item.icon size={15} strokeWidth={1.8} />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {projects.length > 0 && (
          <CommandGroup heading="Projetos">
            {projects.map((p) => (
              <CommandItem
                key={p.id}
                value={`projeto ${p.name}`}
                onSelect={run(() => selectProject(p.id))}
              >
                <Folder size={15} strokeWidth={1.8} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-micro text-text-3">
                  {p.status || 'Planejado'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {rankedTasks.length > 0 && (
          <CommandGroup heading="Tarefas">
            {rankedTasks.map((t) => (
              <CommandItem
                key={t.id}
                value={`tarefa ${t.name}`}
                onSelect={run(() => {
                  selectProject(t.projectId);
                  setProjectTab('gantt');
                  openTaskInspector(t.id);
                })}
              >
                <CheckSquare size={15} strokeWidth={1.8} />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-micro tabular-nums text-text-3">
                  {t.progress || 0}%
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {anomalies.length > 0 && (
          <CommandGroup heading="Anomalias">
            {anomalies.slice(0, 20).map((a) => (
              <CommandItem
                key={a.id}
                value={`anomalia ${a.title}`}
                onSelect={run(() => {
                  selectProject(a.projectId);
                  setProjectTab('anomalies');
                })}
              >
                <AlertTriangle size={15} strokeWidth={1.8} />
                <span className="truncate">{a.title}</span>
                <span className="ml-auto text-micro text-text-3">{a.severity}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferências">
          <CommandItem value="tema claro" onSelect={run(() => setTheme('light'))}>
            Tema claro
          </CommandItem>
          <CommandItem value="tema escuro" onSelect={run(() => setTheme('dark'))}>
            Tema escuro
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
