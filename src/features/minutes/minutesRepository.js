import { requireClient, throwIfError } from '../../utils/supabaseRepository'
import { generateId } from '../../utils/ids'
import { EMPTY_DOC, extractActions, extractPlainText, dedupeActionIds } from './minuteDoc'
import { MINUTE_TEMPLATES } from './templates'

const pad = (n) => String(n).padStart(2, '0')

/** Limites de `meeting_minutes` (CHECK char_length). O RPC grava a ata inteira: um campo longo travaria todo save. */
export const MINUTE_LIMITS = { title: 200, location: 200, participants: 2000 }

export function defaultMinuteTitle(date = new Date()) {
  return `Reunião de ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

export function hourStartMeetingAt(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
}

export function newMinute(projectId, templateId, date = new Date()) {
  const template = MINUTE_TEMPLATES.find((t) => t.id === templateId) || MINUTE_TEMPLATES[0]
  return {
    id: generateId(),
    projectId,
    title: defaultMinuteTitle(date),
    meetingAt: hourStartMeetingAt(date),
    location: '',
    participants: '',
    template: template.id,
    content: dedupeActionIds(template.doc, generateId),
    createdAt: null,
    updatedAt: null,
  }
}

export function minuteFromRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title || '',
    meetingAt: row.meeting_at || '',
    location: row.location || '',
    participants: row.participants || '',
    template: row.template || 'blank',
    content: row.content || structuredClone(EMPTY_DOC),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function actionFromRow(row) {
  return {
    id: row.id,
    minuteId: row.minute_id,
    projectId: row.project_id,
    description: row.description || '',
    ownerName: row.owner_name || '',
    dueDate: row.due_date || null,
    status: row.status,
    taskId: row.task_id || null,
    position: row.position,
  }
}

export function minuteToRpcArgs(minute, workspaceId) {
  const content = dedupeActionIds(minute.content || EMPTY_DOC, generateId)
  return {
    p_minute: {
      id: minute.id,
      workspace_id: workspaceId,
      project_id: minute.projectId,
      title: (minute.title || '').slice(0, MINUTE_LIMITS.title),
      meeting_at: minute.meetingAt || null,
      location: (minute.location || '').slice(0, MINUTE_LIMITS.location),
      participants: (minute.participants || '').slice(0, MINUTE_LIMITS.participants),
      template: minute.template || 'blank',
      content,
      content_text: extractPlainText(content),
    },
    p_actions: extractActions(content).map((a) => ({
      id: a.id,
      description: a.description,
      owner_name: a.ownerName,
      due_date: a.dueDate || null,
      status: a.status,
      task_id: a.taskId || null,
    })),
  }
}

export async function listMinutes(projectId, query = '') {
  let request = requireClient()
    .from('meeting_minutes')
    .select('id, title, meeting_at, location, updated_at')
    .eq('project_id', projectId)
  const text = (query || '').trim()
  if (text) request = request.textSearch('search_tsv', text, { type: 'websearch', config: 'portuguese' })
  const rows = throwIfError(await request.order('meeting_at', { ascending: false })) || []
  return rows.map((r) => ({
    id: r.id,
    title: r.title || '',
    meetingAt: r.meeting_at || '',
    location: r.location || '',
    updatedAt: r.updated_at,
  }))
}

export async function loadMinute(id) {
  const result = await requireClient().from('meeting_minutes').select('*').eq('id', id).single()
  return minuteFromRow(throwIfError(result))
}

export async function saveMinute(minute, workspaceId) {
  const result = await requireClient()
    .rpc('save_meeting_minute', minuteToRpcArgs(minute, workspaceId))
    .single()
  return minuteFromRow(throwIfError(result))
}

export async function deleteMinute(id) {
  throwIfError(await requireClient().from('meeting_minutes').delete().eq('id', id))
}

export async function listProjectActions(projectId, { status } = {}) {
  let request = requireClient().from('meeting_actions').select('*').eq('project_id', projectId)
  if (status) request = request.eq('status', status)
  const rows =
    throwIfError(await request.order('due_date', { ascending: true, nullsFirst: false })) || []
  return rows.map(actionFromRow)
}
