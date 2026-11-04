import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppContext } from '../../context/AppContext'
import { friendlyDbError } from '../../utils/supabaseRepository'
import { clearMissingTaskLinks, updateActionInDoc } from './minuteDoc'
import { listProjectActions, loadMinute, saveMinute } from './minutesRepository'

export const OVERVIEW_ACTION_LIMIT = 6

// Por prazo crescente, sem prazo por último.
const byDueDate = (a, b) =>
  a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : a.dueDate ? -1 : b.dueDate ? 1 : 0

/** Ações abertas do projeto para o cartão da Visão Geral. */
export function useOpenMinuteActions(projectId) {
  const { state, showToast } = useContext(AppContext)
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(() => new Set())
  const inFlight = useRef(new Set())
  const stateRef = useRef(state)
  stateRef.current = state

  const refresh = useCallback(async () => {
    try {
      setActions(await listProjectActions(projectId, { status: 'aberta' }))
    } catch (e) {
      showToast(friendlyDbError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, showToast])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const complete = useCallback(
    async (action) => {
      if (inFlight.current.has(action.id)) return
      inFlight.current.add(action.id)
      setBusy((prev) => new Set(prev).add(action.id))
      try {
        const minute = await loadMinute(action.minuteId)
        const ids = new Set(stateRef.current.tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
        const content = updateActionInDoc(clearMissingTaskLinks(minute.content, ids), action.id, { status: 'concluída' })
        await saveMinute({ ...minute, content }, stateRef.current.auth?.workspace?.id)
        setActions((prev) => prev.filter((a) => a.id !== action.id))
      } catch (e) {
        showToast(friendlyDbError(e), 'error')
      } finally {
        inFlight.current.delete(action.id)
        setBusy((prev) => {
          const next = new Set(prev)
          next.delete(action.id)
          return next
        })
      }
    },
    [projectId, showToast],
  )

  const visible = [...actions].sort(byDueDate).slice(0, OVERVIEW_ACTION_LIMIT)
  return { actions: visible, loading, busy, complete }
}
