import React, { useState } from 'react';
import {
  CalendarClock, Check, ChevronDown, Download, Eye, FileText, Filter, Indent,
  Link2, Link2Off, ListPlus, Maximize2, MoreHorizontal, Outdent, Redo2,
  Settings2, SlidersHorizontal, Target, Undo2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { calendarsOf, defaultCalendarOf } from '../../utils/calendar';
import GanttCalendarMenu from './GanttCalendarMenu';
import GanttFilterMenu from './GanttFilterMenu';

const TABS = [
  { id: 'task', label: 'Tarefa' }, { id: 'project', label: 'Projeto' },
  { id: 'view', label: 'Exibir' }, { id: 'format', label: 'Formato' },
];

function RibbonCommand({ icon: Icon, label, active, className = '', ...props }) {
  return <Button type="button" variant={active ? 'secondary' : 'ghost'} size="sm" title={label} className={`h-8 gap-1.5 px-2 text-small ${className}`} {...props}><Icon data-icon="inline-start" /><span>{label}</span></Button>;
}

function RibbonGroup({ children }) {
  return <div className="flex items-center gap-1 px-2"><>{children}</><Separator orientation="vertical" className="ml-1 h-5" /></div>;
}

function ZoomControl({ zoom, levels, onChange }) {
  return <ToggleGroup type="single" value={zoom.id} onValueChange={(id) => id && onChange(id)} size="xs">{levels.map((level) => <ToggleGroupItem key={level.id} value={level.id}>{level.label}</ToggleGroupItem>)}</ToggleGroup>;
}

function DisplayMenu({ density, setDensityId, densities, showProjectSummary, setShowProjectSummary, showBarLabels, setShowBarLabels, showCriticalPath, setShowCriticalPath, showSlack, setShowSlack }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><RibbonCommand icon={Eye} label="Exibição" active={density.id !== densities[0].id || !showProjectSummary || !showBarLabels || showCriticalPath || showSlack} /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-56"><DropdownMenuLabel>Exibição</DropdownMenuLabel><DropdownMenuRadioGroup value={density.id} onValueChange={setDensityId}>{densities.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuCheckboxItem checked={showProjectSummary} onCheckedChange={setShowProjectSummary}>Resumo global</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={showBarLabels} onCheckedChange={setShowBarLabels}>Rótulos nas barras</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={showCriticalPath} onCheckedChange={setShowCriticalPath}>Caminho crítico</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={showSlack} onCheckedChange={setShowSlack}>Folga total</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu>;
}

function BaselineMenu({ baselineCount, totalTasks, selectedCount, showBaseline, setShowBaseline, onSave, onClear }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><RibbonCommand icon={Target} label="Linha de base" active={baselineCount > 0} /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>{baselineCount > 0 ? `Linha de base: ${baselineCount}/${totalTasks}` : 'Linha de base'}</DropdownMenuLabel><DropdownMenuItem onSelect={() => onSave('project')}>Gravar do projeto inteiro</DropdownMenuItem><DropdownMenuItem disabled={selectedCount === 0} onSelect={() => onSave('selection')}>Gravar da seleção ({selectedCount})</DropdownMenuItem><DropdownMenuCheckboxItem checked={showBaseline} disabled={baselineCount === 0} onCheckedChange={setShowBaseline}>Mostrar na barra</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuItem disabled={baselineCount === 0} onSelect={onClear} variant="destructive">Limpar linha de base</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function ExportMenu({ orientation, setOrientation, onExcel, onPdf }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><RibbonCommand icon={MoreHorizontal} label="Mais" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60"><DropdownMenuLabel>Exportar</DropdownMenuLabel><DropdownMenuItem onSelect={onExcel}><Download data-icon="inline-start" />Excel</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>PDF</DropdownMenuLabel><DropdownMenuRadioGroup value={orientation} onValueChange={setOrientation}><DropdownMenuRadioItem value="landscape">Paisagem</DropdownMenuRadioItem><DropdownMenuRadioItem value="portrait">Retrato</DropdownMenuRadioItem></DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuItem onSelect={onPdf}><FileText data-icon="inline-start" />Imprimir ou salvar PDF</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function TaskOptionsMenu({ selectedCount, calendarLabel, calendars, defaultCalendar, onCalendarChange, onScheduleMode, onProgress, onOpenDetails, onClearSelection }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><SlidersHorizontal data-icon="inline-start" />Opções da tarefa<ChevronDown data-icon="inline-end" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{selectedCount} tarefa{selectedCount === 1 ? '' : 's'} selecionada{selectedCount === 1 ? '' : 's'}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><CalendarClock />Calendário <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">{calendarLabel}</span></DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60"><DropdownMenuLabel>Preserva a duração útil</DropdownMenuLabel><DropdownMenuItem onSelect={() => onCalendarChange('')}><Check className={calendarLabel === defaultCalendar.name ? 'opacity-100' : 'opacity-0'} />Usar padrão: {defaultCalendar.name}</DropdownMenuItem><DropdownMenuSeparator />{calendars.map((calendar) => <DropdownMenuItem key={calendar.id} onSelect={() => onCalendarChange(calendar.id)}><Check className={calendarLabel === calendar.name ? 'opacity-100' : 'opacity-0'} />{calendar.name}</DropdownMenuItem>)}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger><Settings2 />Agendamento</DropdownMenuSubTrigger><DropdownMenuSubContent className="w-52"><DropdownMenuItem onSelect={() => onScheduleMode('auto')}>Automático</DropdownMenuItem><DropdownMenuItem onSelect={() => onScheduleMode('manual')}>Manual</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger><Target />Progresso</DropdownMenuSubTrigger><DropdownMenuSubContent className="w-40">{[0, 25, 50, 75, 100].map((value) => <DropdownMenuItem key={value} onSelect={() => onProgress(value)}>{value}% concluída</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={selectedCount !== 1} onSelect={onOpenDetails}>Abrir detalhes</DropdownMenuItem>
        <DropdownMenuItem onSelect={onClearSelection}>Limpar seleção</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GanttRibbon(props) {
  const [tab, setTab] = useState('task');
  const {
    project, tasks, filters, filteredOut, zoom, zoomLevels, onZoom, onFit, density, setDensityId, densities,
    showProjectSummary, setShowProjectSummary, showBarLabels, setShowBarLabels, showCriticalPath, setShowCriticalPath,
    showSlack, setShowSlack, selectedCount, selectedDependencyCount, selectedCalendarLabel, onSelectionCalendarChange,
    onSelectionScheduleMode, onSelectionProgress, onOpenSelectedDetails, onClearSelection, onIndent, onOutdent,
    onLink, onUnlink, baselineCount, showBaseline, setShowBaseline, onSaveBaseline, onClearBaseline, onCalendarChange,
    onProjectSettings, canUndo, canRedo, onUndo, onRedo, onNewTask, onExcel, onPdf, orientation, setOrientation,
    onFiltersChange,
  } = props;
  const calendars = calendarsOf(project);
  const defaultCalendar = defaultCalendarOf(project);

  return (
    <div className="shrink-0 border-b border-line bg-surface-1" aria-label="Comandos do Gantt">
      <div className="flex h-10 items-center border-b border-line px-3"><Tabs value={tab} onValueChange={setTab} className="min-w-0"><TabsList variant="line" className="h-10 gap-0 p-0">{TABS.map((item) => <TabsTrigger key={item.id} value={item.id} className="h-10 rounded-none px-3 data-[state=active]:text-brand data-[state=active]:after:bg-brand">{item.label}</TabsTrigger>)}</TabsList></Tabs><div className="ml-auto flex items-center gap-1"><Button type="button" variant="ghost" size="icon-xs" title="Desfazer (⌘Z)" aria-label="Desfazer" onClick={onUndo} disabled={!canUndo}><Undo2 /></Button><Button type="button" variant="ghost" size="icon-xs" title="Refazer (⇧⌘Z)" aria-label="Refazer" onClick={onRedo} disabled={!canRedo}><Redo2 /></Button><ExportMenu orientation={orientation} setOrientation={setOrientation} onExcel={onExcel} onPdf={onPdf} /></div></div>
      {selectedCount > 0 && <div className="flex h-10 items-center gap-2 border-b border-brand/20 bg-brand-soft px-3"><Badge variant="default">{selectedCount} selecionada{selectedCount === 1 ? '' : 's'}</Badge><span className="hidden text-small text-text-2 sm:inline">Edição em lote</span><div className="ml-auto"><TaskOptionsMenu selectedCount={selectedCount} calendarLabel={selectedCalendarLabel} calendars={calendars} defaultCalendar={defaultCalendar} onCalendarChange={onSelectionCalendarChange} onScheduleMode={onSelectionScheduleMode} onProgress={onSelectionProgress} onOpenDetails={onOpenSelectedDetails} onClearSelection={onClearSelection} /></div></div>}
      <div className="flex h-12 items-center overflow-x-auto">
        {tab === 'task' && <><RibbonGroup><RibbonCommand icon={ListPlus} label="Nova tarefa" onClick={onNewTask} /><RibbonCommand icon={Indent} label="Recuar" onClick={onIndent} disabled={!selectedCount} /><RibbonCommand icon={Outdent} label="Avançar" onClick={onOutdent} disabled={!selectedCount} /></RibbonGroup><RibbonGroup><RibbonCommand icon={Link2} label="Vincular" onClick={onLink} disabled={selectedCount < 2} /><RibbonCommand icon={Link2Off} label="Desvincular" onClick={onUnlink} disabled={!selectedDependencyCount} /></RibbonGroup><RibbonGroup><BaselineMenu baselineCount={baselineCount} totalTasks={tasks.length} selectedCount={selectedCount} showBaseline={showBaseline} setShowBaseline={setShowBaseline} onSave={onSaveBaseline} onClear={onClearBaseline} /></RibbonGroup></>}
        {tab === 'project' && <><RibbonGroup><RibbonCommand icon={Settings2} label="Informações" onClick={onProjectSettings} /><GanttCalendarMenu project={project} tasks={tasks} onChange={onCalendarChange} trigger={<RibbonCommand icon={CalendarDaysIcon} label="Calendário" />} /></RibbonGroup><RibbonGroup><BaselineMenu baselineCount={baselineCount} totalTasks={tasks.length} selectedCount={selectedCount} showBaseline={showBaseline} setShowBaseline={setShowBaseline} onSave={onSaveBaseline} onClear={onClearBaseline} /></RibbonGroup></>}
        {tab === 'view' && <><RibbonGroup><ZoomControl zoom={zoom} levels={zoomLevels} onChange={onZoom} /><RibbonCommand icon={Maximize2} label="Ajustar" onClick={onFit} /></RibbonGroup><RibbonGroup><DisplayMenu density={density} setDensityId={setDensityId} densities={densities} showProjectSummary={showProjectSummary} setShowProjectSummary={setShowProjectSummary} showBarLabels={showBarLabels} setShowBarLabels={setShowBarLabels} showCriticalPath={showCriticalPath} setShowCriticalPath={setShowCriticalPath} showSlack={showSlack} setShowSlack={setShowSlack} /><GanttFilterMenu filters={filters} onChange={onFiltersChange} filteredOut={filteredOut} trigger={<RibbonCommand icon={Filter} label="Filtros" />} /></RibbonGroup></>}
        {tab === 'format' && <><RibbonGroup><RibbonCommand icon={Eye} label="Rótulos" active={showBarLabels} onClick={() => setShowBarLabels(!showBarLabels)} /><RibbonCommand icon={Target} label="Crítico" active={showCriticalPath} onClick={() => setShowCriticalPath(!showCriticalPath)} /><RibbonCommand icon={Link2} label="Folga" active={showSlack} onClick={() => setShowSlack(!showSlack)} /></RibbonGroup></>}
      </div>
    </div>
  );
}

function CalendarDaysIcon(props) { return <CalendarClock {...props} />; }
