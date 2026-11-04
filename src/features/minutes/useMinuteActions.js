import { useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { AppContext } from '../../context/AppContext'
import { friendlyDbError } from '../../utils/supabaseRepository'
import { clearMissingTaskLinks, extractActions, updateActionInDoc } from './minuteDoc'
import { createTaskFromAction } from './MinuteActionsPanel'

/**
 * Ações da ata aberta: criar tarefa a partir de uma ação, mudar status e
 * soltar vínculos com tarefas que não existem mais (o documento é a fonte
 * da verdade; um taskId pendurado violaria o FK no próximo save).
 */
export function useMinuteActions(activeMinute, updateActiveMinute) {
  const { state, addTask, showToast } = useContext(AppContext)
  const project = state.projects?.find((p) => p.id === state.activeProjectId)
  const projectTasks = useMemo(
    () => (state.tasks || []).filter((t) => t.projectId === state.activeProjectId),
    [state.tasks, state.activeProjectId],
  )
  const taskIdsKey = projectTasks.map((t) => t.id).sort().join('|')

  const minuteRef = useRef(activeMinute)
  minuteRef.current = activeMinute
  const inFlight = useRef(new Set())

  const minuteId = activeMinute?.id
  useEffect(() => {
    const minute = minuteRef.current
    if (!minute) return
    const next = clearMissingTaskLinks(minute.content, new Set(taskIdsKey ? taskIdsKey.split('|') : []))
    if (next !== minute.content) updateActiveMinute({ content: next })
  }, [minuteId, taskIdsKey, updateActiveMinute])

  const createTask = useCallback(
    async (actionId) => {
      const minute = minuteRef.current
      if (!minute || !project || inFlight.current.has(actionId)) return
      const action = extractActions(minute.content).find((a) => a.id === actionId)
      if (!action || action.taskId) return
      inFlight.current.add(actionId)
      try {
        const task = createTaskFromAction(project, action, projectTasks.length)
        await addTask(task)
        // Relê o documento: o usuário pode ter editado enquanto a tarefa era salva.
        const current = minuteRef.current
        if (current?.id === minute.id) {
          updateActiveMinute({ content: updateActionInDoc(current.content, actionId, { taskId: task.id }) })
        }
      } catch (e) {
        showToast(`Não foi possível criar a tarefa. ${friendlyDbError(e)}`, 'error')
      } finally {
        inFlight.current.delete(actionId)
      }
    },
    [project, projectTasks.length, addTask, showToast, updateActiveMinute],
  )

  const setActionStatus = useCallback(
    (actionId, status) => {
      const minute = minuteRef.current
      if (minute) updateActiveMinute({ content: updateActionInDoc(minute.content, actionId, { status }) })
    },
    [updateActiveMinute],
  )

  return { createTask, setActionStatus }
}
