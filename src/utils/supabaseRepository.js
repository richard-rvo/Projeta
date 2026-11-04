import { supabase } from '../lib/supabase';
import { DEFAULT_CALENDAR, DEFAULT_CALENDAR_ID, calendarsOf } from './calendar';
import { readDependencies } from './dependencies';
import { generateId } from './ids';

function requireClient() {
  if (!supabase) throw new Error('Supabase não está configurado. Confira SUPABASE_URL e SUPABASE_ANON_KEY.');
  return supabase;
}

export function friendlyDbError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  if (text.includes('plan_limit_projects')) return 'Você atingiu o limite de projetos do seu plano.';
  if (error?.code === '42501') return 'Você não tem permissão para esta ação.';
  if (error?.code === '23514') return 'Algum campo está fora do formato ou do tamanho permitido.';
  return error?.message || 'Não foi possível gravar no workspace Supabase.';
}

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function projectFromRow(row) {
  return {
    ...(row.metadata || {}),
    id: row.id,
    name: row.name,
    description: row.description || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    status: row.status || 'Planejado',
    calendars: Array.isArray(row.calendars) && row.calendars.length ? row.calendars : [{ ...DEFAULT_CALENDAR }],
    defaultCalendarId: row.default_calendar_id || DEFAULT_CALENDAR_ID,
    calendarSettings: row.calendar_settings || { durationDisplay: 'auto' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectToRow(project, workspaceId) {
  const calendars = calendarsOf(project);
  return {
    id: project.id || generateId(),
    workspace_id: workspaceId,
    name: project.name,
    description: project.description || '',
    start_date: project.startDate || null,
    end_date: project.endDate || null,
    status: project.status || 'Planejado',
    calendars,
    default_calendar_id: project.defaultCalendarId || calendars[0]?.id || DEFAULT_CALENDAR_ID,
    calendar_settings: project.calendarSettings || { durationDisplay: 'auto' },
    metadata: {
      createdAt: project.createdAt,
      ...(project.metadata || {}),
    },
  };
}

export function taskFromRow(row) {
  return {
    ...(row.metadata || {}),
    id: row.id,
    projectId: row.project_id,
    name: row.name || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    baselineStart: row.baseline_start || '',
    baselineEnd: row.baseline_end || '',
    progress: Number(row.progress || 0),
    scheduleMode: row.schedule_mode || 'auto',
    calendarId: row.calendar_id || undefined,
    dependsOn: readDependencies(row.depends_on),
    constraintType: row.constraint_type || undefined,
    constraintDate: row.constraint_date || undefined,
    indentLevel: row.indent_level || 0,
    order: row.order_index || 0,
    resources: row.resources || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskToRow(task, workspaceId) {
  return {
    id: task.id || generateId(),
    workspace_id: workspaceId,
    project_id: task.projectId,
    name: task.name || '',
    start_date: task.startDate || null,
    end_date: task.endDate || null,
    baseline_start: task.baselineStart || null,
    baseline_end: task.baselineEnd || null,
    progress: Number(task.progress || 0),
    schedule_mode: task.scheduleMode || 'auto',
    calendar_id: task.calendarId || null,
    depends_on: Array.isArray(task.dependsOn) ? task.dependsOn : readDependencies(task.dependsOn),
    constraint_type: task.constraintType || null,
    constraint_date: task.constraintDate || null,
    indent_level: task.indentLevel || 0,
    order_index: task.order || 0,
    resources: Array.isArray(task.resources) ? task.resources : [],
    metadata: {
      ...(task.metadata || {}),
      isSummary: task.isSummary || undefined,
    },
  };
}

export function anomalyFromRow(row) {
  return {
    ...(row.metadata || {}),
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id || '',
    title: row.title || '',
    description: row.description || '',
    status: row.status || 'aberta',
    severity: row.severity || '',
    photos: row.photos || [],
    occurredAt: row.occurred_at || '',
    resolvedAt: row.resolved_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function anomalyToRow(anomaly, workspaceId) {
  const {
    id, projectId, taskId, title, description, status, severity, photos,
    occurredAt, resolvedAt, ...metadata
  } = anomaly;
  return {
    id: id || generateId(),
    workspace_id: workspaceId,
    project_id: projectId,
    task_id: taskId || null,
    title: title || '',
    description: description || '',
    status: status || 'aberta',
    severity: severity || null,
    photos: Array.isArray(photos) ? photos : [],
    occurred_at: occurredAt || null,
    resolved_at: resolvedAt || null,
    metadata,
  };
}

export async function ensureWorkspace(user) {
  const client = requireClient();
  const profile = await client.from('profiles').upsert({
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email || 'Usuário',
    avatar_url: user.user_metadata?.avatar_url || null,
  }, { onConflict: 'id' });
  throwIfError(profile);

  const existing = await client
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1);
  const workspaces = throwIfError(existing) || [];
  if (workspaces[0]) return workspaces[0];

  const created = await client
    .from('workspaces')
    .insert({ name: `${user.user_metadata?.full_name || 'Meu'} workspace`, owner_id: user.id })
    .select('*')
    .single();
  return throwIfError(created);
}

export async function updateWorkspace(workspaceId, patch) {
  const result = await requireClient()
    .from('workspaces')
    .update({ name: patch.name, timezone: patch.timezone })
    .eq('id', workspaceId)
    .select('*')
    .single();
  return throwIfError(result);
}

export async function listWorkspaceMembers(workspaceId) {
  const result = await requireClient()
    .from('workspace_members')
    .select('user_id, role, joined_at, profiles(display_name, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('joined_at');
  return throwIfError(result) || [];
}

export async function loadWorkspaceData(workspaceId) {
  const client = requireClient();
  const [projects, tasks, anomalies] = await Promise.all([
    client.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at'),
    client.from('tasks').select('*').eq('workspace_id', workspaceId).order('order_index'),
    client.from('anomalies').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
  ]);
  return {
    projects: (throwIfError(projects) || []).map(projectFromRow),
    tasks: (throwIfError(tasks) || []).map(taskFromRow),
    anomalies: (throwIfError(anomalies) || []).map(anomalyFromRow),
  };
}

export async function saveProject(project, workspaceId) {
  const result = await requireClient().from('projects').upsert(projectToRow(project, workspaceId)).select('*').single();
  return projectFromRow(throwIfError(result));
}

export async function deleteProject(id, workspaceId) {
  throwIfError(await requireClient().from('projects').delete().eq('id', id).eq('workspace_id', workspaceId));
}

export async function saveTask(task, workspaceId) {
  const result = await requireClient().from('tasks').upsert(taskToRow(task, workspaceId)).select('*').single();
  return taskFromRow(throwIfError(result));
}

export async function deleteTask(id, workspaceId) {
  throwIfError(await requireClient().from('tasks').delete().eq('id', id).eq('workspace_id', workspaceId));
}

export async function saveAnomaly(anomaly, workspaceId) {
  const result = await requireClient().from('anomalies').upsert(anomalyToRow(anomaly, workspaceId)).select('*').single();
  return anomalyFromRow(throwIfError(result));
}

export async function deleteAnomaly(id, workspaceId) {
  throwIfError(await requireClient().from('anomalies').delete().eq('id', id).eq('workspace_id', workspaceId));
}

export async function verifyWorkspaceData(workspaceId, expected) {
  const actual = await loadWorkspaceData(workspaceId);
  const normalize = (list) => JSON.stringify([...list].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  if (normalize(actual.projects) !== normalize(expected.projects)
    || normalize(actual.tasks) !== normalize(expected.tasks)
    || normalize(actual.anomalies) !== normalize(expected.anomalies)) {
    throw new Error('Os dados em tela e o Supabase não conferem.');
  }
  return true;
}

export function exportWorkspaceBackup({ projects, tasks, anomalies }) {
  const data = {
    projects,
    tasks,
    anomalies: anomalies.map(({ photos: _photos, ...anomaly }) => anomaly),
    exportedAt: new Date().toISOString(),
    version: 6,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `projeta_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
