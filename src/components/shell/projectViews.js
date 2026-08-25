import { AlertTriangle, Columns3, GanttChartSquare, LayoutPanelLeft, TrendingUp } from 'lucide-react';

export const PROJECT_VIEWS = [
  { id: 'overview', icon: LayoutPanelLeft, label: 'Visão Geral' },
  { id: 'gantt', icon: GanttChartSquare, label: 'Gantt' },
  { id: 'kanban', icon: Columns3, label: 'Quadro' },
  { id: 'scurve', icon: TrendingUp, label: 'Curva S' },
  { id: 'anomalies', icon: AlertTriangle, label: 'Anomalias', badge: true },
];
