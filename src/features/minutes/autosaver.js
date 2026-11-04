export function createAutosaver({ save, delay = 1200, onStatus = () => {} }) {
  let timer = null
  let hasPending = false
  let pendingValue
  let running = null
  let disposed = false

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  async function run() {
    if (running) {
      await running
      if (!hasPending) return
    }
    if (!hasPending) return
    const value = pendingValue
    hasPending = false
    pendingValue = undefined
    onStatus('saving')
    running = (async () => {
      try {
        await save(value)
        // Só marca como salvo se nada novo foi agendado durante o save.
        onStatus(hasPending ? 'pending' : 'saved')
      } catch {
        // Mantém o valor para nova tentativa, a menos que um mais novo já exista.
        if (!hasPending) {
          hasPending = true
          pendingValue = value
        }
        onStatus('error')
      }
    })()
    try {
      await running
    } finally {
      running = null
    }
  }

  return {
    schedule(value) {
      if (disposed) return
      pendingValue = value
      hasPending = true
      onStatus('pending')
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        run()
      }, delay)
    },
    async flush() {
      clearTimer()
      await run()
    },
    dispose() {
      disposed = true
      clearTimer()
    },
  }
}
