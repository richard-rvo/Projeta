import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppContext } from '../../context/AppContext'
import { friendlyDbError } from '../../utils/supabaseRepository'
import { createAutosaver } from './autosaver'
import { deleteMinute, listMinutes, loadMinute, newMinute, saveMinute } from './minutesRepository'

export function useProjectMinutes(projectId) {
  const { state } = useContext(AppContext)
  const workspaceId = state.auth?.workspace?.id

  const [minutes, setMinutes] = useState([])
  const [query, setQuery] = useState('')
  const [activeMinute, setActiveMinute] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [error, setError] = useState('')

  const activeRef = useRef(null)
  const queryRef = useRef(query)
  const workspaceRef = useRef(workspaceId)
  const statusRef = useRef('idle')
  const autosaverRef = useRef(null)
  queryRef.current = query
  workspaceRef.current = workspaceId

  const refreshList = useCallback(async () => {
    try {
      setMinutes(await listMinutes(projectId, queryRef.current))
    } catch (e) {
      setError(friendlyDbError(e))
    }
  }, [projectId])

  const makeAutosaver = () =>
    createAutosaver({
      save: async (minute) => {
        try {
          await saveMinute(minute, workspaceRef.current)
        } catch (e) {
          setError(friendlyDbError(e))
          throw e
        }
        setError('')
        refreshList()
      },
      onStatus: (status) => {
        statusRef.current = status
        setSaveStatus(status)
      },
    })

  useEffect(() => {
    const id = setTimeout(refreshList, query ? 250 : 0)
    return () => clearTimeout(id)
  }, [refreshList, query])

  useEffect(() => {
    // Criado no efeito para sobreviver ao remount do StrictMode (dispose é definitivo).
    const autosaver = makeAutosaver()
    autosaverRef.current = autosaver
    return () => {
      autosaver.flush().finally(() => autosaver.dispose())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ao trocar de projeto, descarta a ata aberta (o flush acima cobre o desmonte).
  useEffect(() => {
    activeRef.current = null
    setActiveMinute(null)
  }, [projectId])

  const pending = saveStatus === 'pending' || saveStatus === 'saving' || saveStatus === 'error'
  useEffect(() => {
    if (!pending) return undefined
    const warnBeforeClosing = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeClosing)
    return () => window.removeEventListener('beforeunload', warnBeforeClosing)
  }, [pending])

  const flushOrFail = useCallback(async () => {
    await autosaverRef.current.flush()
    if (statusRef.current === 'error') return false
    return true
  }, [])

  const openMinute = useCallback(
    async (id) => {
      if (activeRef.current?.id === id) return
      if (!(await flushOrFail())) return
      try {
        const minute = await loadMinute(id)
        activeRef.current = minute
        setActiveMinute(minute)
        setError('')
      } catch (e) {
        setError(friendlyDbError(e))
      }
    },
    [flushOrFail],
  )

  const createMinute = useCallback(
    async (templateId) => {
      if (!(await flushOrFail())) return null
      const minute = newMinute(projectId, templateId)
      try {
        await saveMinute(minute, workspaceRef.current)
      } catch (e) {
        setError(friendlyDbError(e))
        return null
      }
      activeRef.current = minute
      setActiveMinute(minute)
      setError('')
      refreshList()
      return minute
    },
    [flushOrFail, projectId, refreshList],
  )

  const retrySave = useCallback(() => autosaverRef.current.flush(), [])

  const updateActiveMinute = useCallback((patch) => {
    if (!activeRef.current) return
    const next = { ...activeRef.current, ...patch }
    activeRef.current = next
    setActiveMinute(next)
    autosaverRef.current.schedule(next)
  }, [])

  const removeMinute = useCallback(
    async (id) => {
      try {
        if (activeRef.current?.id === id) {
          // Descarta o save pendente (inclusive um que falhou) para não ressuscitar a ata.
          autosaverRef.current.discard()
          await autosaverRef.current.flush()
          activeRef.current = null
          setActiveMinute(null)
        }
        await deleteMinute(id)
        setError('')
        refreshList()
      } catch (e) {
        setError(friendlyDbError(e))
      }
    },
    [refreshList],
  )

  return {
    minutes,
    query,
    setQuery,
    activeMinute,
    openMinute,
    createMinute,
    updateActiveMinute,
    removeMinute,
    retrySave,
    saveStatus,
    error,
  }
}
