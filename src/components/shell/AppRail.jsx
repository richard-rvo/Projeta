import React, { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutGrid,
  AlertTriangle,
  FileBarChart,
  Settings,
  Sun,
  Moon,
  Pin,
  PinOff,
} from 'lucide-react';
import { PROJECT_VIEWS } from './projectViews';

const NAV_ITEMS = [
  { id: 'pagePortfolio', icon: LayoutGrid, label: 'Portfólio' },
  { id: 'pageAnomalies', icon: AlertTriangle, label: 'Anomalias', badge: 'anomalies' },
  { id: 'pageReports', icon: FileBarChart, label: 'Relatórios' },
  { id: 'pageSettings', icon: Settings, label: 'Configurações' },
];

const RAIL_W = 68;
const RAIL_W_OPEN = 224;

/**
 * Trilho de navegação global.
 *
 * Fica em 64px e SOBREPÕE o conteúdo ao expandir, em vez de empurrá-lo:
 * reflow a cada passada de mouse é exatamente o tipo de instabilidade
 * que a referência Apple não tem. Fixar o trilho reserva a largura de
 * verdade no layout.
 */
export default function AppRail() {
  const { state, navigate, setProjectTab, toggleRailPinned, setTheme } =
    useContext(AppContext);
  const [hovered, setHovered] = useState(false);

  const pinned = state.railPinned;
  const open = pinned || hovered;

  const openAnomalies = state.anomalies.filter((a) => a.status === 'aberta').length;
  const isDark = state.theme === 'dark';
  const insideProject = state.activePage === 'pageProjectWorkspace';
  const activeProjectTab = state.activeProjectTab || 'overview';

  /* Dentro de um projeto nenhum item global fica aceso — o contexto
     está no TopBar, não aqui. */
  const activeId =
    state.activePage === 'pageProjectWorkspace' ? null : state.activePage;

  const badgeFor = (key) => (key === 'anomalies' ? openAnomalies : 0);

  return (
    <div
      className="relative shrink-0 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: pinned ? RAIL_W_OPEN : RAIL_W }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden',
          'border-r border-line bg-surface-1',
          'transition-[width,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]'
        )}
        style={{
          width: open ? RAIL_W_OPEN : RAIL_W,
          boxShadow: open && !pinned ? 'var(--elev-3)' : 'none',
        }}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-4">
          <img
            src="/logo-premium.svg"
            alt="RV"
            className="size-9 shrink-0 rounded-[10px] object-contain shadow-elev-1"
          />
          <div
            className={cn(
              'flex min-w-0 flex-col whitespace-nowrap',
              'transition-opacity duration-150',
              open ? 'opacity-100' : 'opacity-0'
            )}
          >
            <span className="text-read font-semibold tracking-tight text-text-1">Projeta</span>
            <span className="text-micro text-text-3">RV Planejamento</span>
          </div>
        </div>

        {insideProject && (
          <nav className="flex flex-col gap-0.5 border-b border-line px-3 py-2" aria-label="Navegação do projeto">
            <RailSectionLabel open={open}>Projeto</RailSectionLabel>
            {PROJECT_VIEWS.map((item) => {
              const Icon = item.icon;
              const isActive = activeProjectTab === item.id;
              const badge = item.badge
                ? state.anomalies.filter((anomaly) => (
                  anomaly.projectId === state.activeProjectId && anomaly.status === 'aberta'
                )).length
                : 0;
              return (
                <Button
                  key={item.id}
                  type="button"
                  onClick={() => setProjectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={!open ? item.label : undefined}
                  title={!open ? item.label : undefined}
                  variant={isActive ? 'navActive' : 'nav'}
                  className="relative h-9 w-full justify-start gap-3 px-2.5"
                >
                  <span className="relative grid size-5 shrink-0 place-items-center">
                    <Icon />
                    {badge > 0 && !open && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-sched-late ring-2 ring-surface-1" />}
                  </span>
                  <span className={cn('flex-1 whitespace-nowrap text-small font-medium transition-opacity duration-150', open ? 'opacity-100' : 'opacity-0')}>
                    {item.label}
                  </span>
                  {badge > 0 && open && <Badge variant="destructive" className="ml-auto">{badge > 99 ? '99+' : badge}</Badge>}
                </Button>
              );
            })}
          </nav>
        )}

        {/* ── Navegação global ─────────────────────────────────── */}
        <nav className="flex flex-col gap-0.5 px-3 pt-2">
          <RailSectionLabel open={open}>Sistema</RailSectionLabel>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            const badge = badgeFor(item.badge);
            return (
              <Button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={!open ? item.label : undefined}
                title={!open ? item.label : undefined}
                variant={isActive ? 'navActive' : 'nav'}
                className="relative h-10 w-full justify-start gap-3 px-2.5"
              >
                <span className="relative grid size-5 shrink-0 place-items-center">
                  <Icon />
                  {/* Colapsado, o badge vira um ponto sobre o ícone */}
                  {badge > 0 && !open && (
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-sched-late ring-2 ring-surface-1" />
                  )}
                </span>
                <span
                  className={cn(
                    'flex-1 whitespace-nowrap text-body font-medium',
                    'transition-opacity duration-150',
                    open ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {item.label}
                </span>
                {badge > 0 && open && (
                  <Badge variant="destructive" className="ml-auto">
                    {badge > 99 ? '99+' : badge}
                  </Badge>
                )}
              </Button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* ── Preferências ─────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2">
          <RailAction
            open={open}
            icon={isDark ? Sun : Moon}
            label={isDark ? 'Tema claro' : 'Tema escuro'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          />
          <RailAction
            open={open}
            icon={pinned ? PinOff : Pin}
            label={pinned ? 'Soltar menu' : 'Fixar menu'}
            onClick={toggleRailPinned}
          />
        </div>

      </aside>
    </div>
  );
}

function RailSectionLabel({ open, children }) {
  return (
    <span className={cn(
      'h-4 overflow-hidden px-2.5 text-micro font-semibold uppercase tracking-[0.12em] text-text-3 transition-opacity duration-150',
      open ? 'opacity-100' : 'opacity-0'
    )}>
      {children}
    </span>
  );
}

function RailAction({ open, icon: Icon, label, onClick }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      title={open ? undefined : label}
      aria-label={!open ? label : undefined}
      variant="nav"
      className="h-9 w-full justify-start gap-3 px-2.5"
    >
      <span className="grid size-5 shrink-0 place-items-center">
        <Icon />
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-small transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0'
        )}
      >
        {label}
      </span>
    </Button>
  );
}
