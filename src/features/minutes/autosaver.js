export function createAutosaver({ save, delay = 1200, onStatus = () => {} }) {
  let timer = null
  let hasPending = false
  let pendingValue
  let running = null
  let disposed = false
  let failed = false
  let generation = 0

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function startSave() {
    const value = pendingValue
    const startedIn = generation
    hasPending = false
    pendingValue = undefined
    onStatus('saving')
    running = (async () => {
      try {
        await save(value)
        // Só marca como salvo se nada novo foi agendado durante o save.
        onStatus(hasPending ? 'pending' : 'saved')
      } catch {
        failed = true
        // Mantém o valor para nova tentativa, a menos que um mais novo exista ou tenha sido descartado.
        if (!hasPending && startedIn === generation) {
          hasPending = true
          pendingValue = value
        }
        onStatus('error')
      } finally {
        running = null
      }
    })()
  }

  // Só resolve quando nada está em andamento e nada pendente (ou o último save falhou).
  async function drain() {
    for (;;) {
      if (running) {
        await running
        continue
      }
      if (!hasPending || failed) return
      startSave()
    }
  }

  return {
    schedule(value) {
      if (disposed) return
      pendingValue = value
      hasPending = true
      failed = false
      onStatus('pending')
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        drain()
      }, delay)
    },
    async flush() {
      clearTimer()
      failed = false
      await drain()
    },
    discard() {
      generation += 1
      clearTimer()
      hasPending = false
      pendingValue = undefined
      failed = false
    },
    dispose() {
      disposed = true
      clearTimer()
    },
  }
}
