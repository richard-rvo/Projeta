import React, { useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarDays, Download, Eye, FileText, Filter,
  Indent, Link2, Link2Off, ListTree, Maximize2, Milestone, Outdent, Redo2,
  Settings2, Target, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GanttCalendarMenu from './GanttCalendarMenu';
import GanttFilterMenu from './GanttFilterMenu';

const TABS = [
  { id: 'task', label: 'Tarefa' },
  { id: 'project', label: 'Projeto' },
  { id: 'view', label: 'Exibir' },
  { id: 'format', label: 'Formato' },
];

const RibbonCommand = React.forwardRef(function RibbonCommand({ icon: Icon, label, active, className, ...props }, ref) {
  return (
    <Button ref={ref} type="button" variant={active ? 'secondary' : 'ghost'} size="sm" title={label} className={cn('h-12 min-w-16 flex-col gap-1 px-2 text-micro', className)} {...props}>
      <Icon data-icon="inline-start" />
      <span className="max-w-16 text-center leading-tight">{label}</span>
    </Button>
  );
});

function RibbonIconAction({ icon: Icon, label, ...props }) {
  return <Button type="button" variant="ghost" size="icon-xs" title={label} aria-label={label} {...props}><Icon /></Button>;
}

function RibbonGroup({ label, children }) {
  return (
    <section className="relative flex min-w-max items-center gap-1 px-2 pb-4 pt-1">
      {children}
      <span className="absolute inset-x-2 bottom-0 truncate text-center text-micro text-text-3">{label}</span>
      <Separator orientation="vertical" className="absolute -right-px top-3 h-10" />
    </section>
  );
}

function ZoomControl({ zoom, levels, onChange }) {
  return (
    <ToggleGroup type="single" value={zoom.id} onValueChange={(id) => id && onChange(id)} size="xs">
      {levels.map((level) => <ToggleGroupItem key={level.id} value={level.id}>{level.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

function DisplayMenu({ density, setDensityId, densities, showProjectSummary, setShowProjectSummary, showBarLabels, setShowBarLabels, showCriticalPath, setShowCriticalPath, showSlack, setShowSlack }) {
  const active = density.id !== densities[0].id || !showProjectSummary || !showBarLabels || showCriticalPath || showSlack;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><RibbonCommand icon={Eye} label="Opções" active={active} /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Exibição</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density.id} onValueChange={setDensityId}>
          {densities.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showProjectSummary} onCheckedChange={setShowProjectSummary}>Resumo global</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showBarLabels} onCheckedChange={setShowBarLabels}>Rótulos nas barras</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showCriticalPath} onCheckedChange={setShowCriticalPath}>Caminho crítico</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showSlack} onCheckedChange={setShowSlack}>Folga total</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BaselineMenu({ baselineCount, totalTasks, selectedCount, showBaseline, setShowBaseline, onSave, onClear }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><RibbonCommand icon={Target} label="Linha de base" active={baselineCount > 0} /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{baselineCount > 0 ? `Linha de base: ${baselineCount}/${totalTasks}` : 'Linha de base'}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSave('project')}>Gravar do projeto inteiro</DropdownMenuItem>
        <DropdownMenuItem disabled={selectedCount === 0} onSelect={() => onSave('selection')}>Gravar da seleção ({selectedCount})</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={showBaseline} disabled={baselineCount === 0} onCheckedChange={setShowBaseline}>Mostrar na barra</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={baselineCount === 0} onSelect={onClear} className="text-sched-late">Limpar linha de base</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExportMenu({ orientation, setOrientation, onExcel, onPdf }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><RibbonCommand icon={Download} label="Exportar" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Arquivos</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onExcel}><Download data-icon="inline-start" />Exportar para Excel</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>PDF</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={orientation} onValueChange={setOrientation}>
          <DropdownMenuRadioItem value="landscape">Paisagem</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="portrait">Retrato</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPdf}><FileText data-icon="inline-start" />Imprimir ou salvar PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GanttRibbon(props) {
  const [tab, setTab] = useState('task');
  const {
    project, tasks, filters, filteredOut, zoom, zoomLevels, onZoom, onFit,
    density, setDensityId, densities, showProjectSummary, setShowProjectSummary,
    showBarLabels, setShowBarLabels, showCriticalPath, setShowCriticalPath, showSlack, setShowSlack,
    selectedCount, selectedDependencyCount, onIndent, onOutdent, onLink, onUnlink,
    baselineCount, showBaseline, setShowBaseline, onSaveBaseline, onClearBaseline,
    onCalendarChange, onProjectSettings, canUndo, canRedo, onUndo, onRedo,
    onNewTask, onExcel, onPdf, orientation, setOrientation, onFiltersChange,
  } = props;

  return (
    <div className="shrink-0 border-b border-line bg-surface-1" aria-label="Faixa de comandos do Gantt">
      <div className="flex h-10 items-center border-b border-line px-3">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList variant="line" className="h-10 gap-0 p-0">
            {TABS.map((item) => <TabsTrigger key={item.id} value={item.id} className="h-10 rounded-none px-3 data-[state=active]:text-brand data-[state=active]:after:bg-brand">{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1">
          <RibbonIconAction icon={Undo2} label="Desfazer (⌘Z)" onClick={onUndo} disabled={!canUndo} />
          <RibbonIconAction icon={Redo2} label="Refazer (⇧⌘Z)" onClick={onRedo} disabled={!canRedo} />
        </div>
      </div>

      <div className="flex h-[72px] overflow-x-auto">
        {tab === 'task' && <>
          <RibbonGroup label="Inserir"><RibbonCommand icon={ListTree} label="Nova tarefa" onClick={onNewTask} /><RibbonCommand icon={Milestone} label="Marco" disabled /></RibbonGroup>
          <RibbonGroup label="Estrutura"><RibbonCommand icon={Indent} label="Recuar" onClick={onIndent} disabled={!selectedCount} /><RibbonCommand icon={Outdent} label="Avançar" onClick={onOutdent} disabled={!selectedCount} /><RibbonCommand icon={ArrowUp} label="Subir" disabled /><RibbonCommand icon={ArrowDown} label="Descer" disabled /></RibbonGroup>
          <RibbonGroup label="Vínculos"><RibbonCommand icon={Link2} label="Vincular" onClick={onLink} disabled={selectedCount < 2} /><RibbonCommand icon={Link2Off} label="Desvincular" onClick={onUnlink} disabled={!selectedDependencyCount} /></RibbonGroup>
          <RibbonGroup label="Planejamento"><BaselineMenu baselineCount={baselineCount} totalTasks={tasks.length} selectedCount={selectedCount} showBaseline={showBaseline} setShowBaseline={setShowBaseline} onSave={onSaveBaseline} onClear={onClearBaseline} /></RibbonGroup>
          <RibbonGroup label="Saída"><ExportMenu orientation={orientation} setOrientation={setOrientation} onExcel={onExcel} onPdf={onPdf} /></RibbonGroup>
        </>}
        {tab === 'project' && <><RibbonGroup label="Projeto"><RibbonCommand icon={Settings2} label="Informações" onClick={onProjectSettings} /><GanttCalendarMenu project={project} tasks={tasks} onChange={onCalendarChange} trigger={<RibbonCommand icon={CalendarDays} label="Calendário" />} /></RibbonGroup><RibbonGroup label="Planejamento"><BaselineMenu baselineCount={baselineCount} totalTasks={tasks.length} selectedCount={selectedCount} showBaseline={showBaseline} setShowBaseline={setShowBaseline} onSave={onSaveBaseline} onClear={onClearBaseline} /></RibbonGroup></>}
        {tab === 'view' && <><RibbonGroup label="Escala"><ZoomControl zoom={zoom} levels={zoomLevels} onChange={onZoom} /><Button type="button" variant="ghost" size="sm" onClick={onFit}><Maximize2 data-icon="inline-start" />Ajustar</Button></RibbonGroup><RibbonGroup label="Dados"><DisplayMenu density={density} setDensityId={setDensityId} densities={densities} showProjectSummary={showProjectSummary} setShowProjectSummary={setShowProjectSummary} showBarLabels={showBarLabels} setShowBarLabels={setShowBarLabels} showCriticalPath={showCriticalPath} setShowCriticalPath={setShowCriticalPath} showSlack={showSlack} setShowSlack={setShowSlack} /><GanttFilterMenu filters={filters} onChange={onFiltersChange} filteredOut={filteredOut} trigger={<RibbonCommand icon={Filter} label="Filtros" />} /></RibbonGroup></>}
        {tab === 'format' && <><RibbonGroup label="Barras"><DisplayMenu density={density} setDensityId={setDensityId} densities={densities} showProjectSummary={showProjectSummary} setShowProjectSummary={setShowProjectSummary} showBarLabels={showBarLabels} setShowBarLabels={setShowBarLabels} showCriticalPath={showCriticalPath} setShowCriticalPath={setShowCriticalPath} showSlack={showSlack} setShowSlack={setShowSlack} /></RibbonGroup><RibbonGroup label="Calendário"><GanttCalendarMenu project={project} tasks={tasks} onChange={onCalendarChange} trigger={<RibbonCommand icon={CalendarDays} label="Calendário" />} /></RibbonGroup></>}
      </div>
    </div>
  );
}
