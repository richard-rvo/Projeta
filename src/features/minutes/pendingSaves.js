/*
 * Saves de atas que sobrevivem à tela.
 *
 * Cada autosaver de ata se registra aqui enquanto a tela está montada. Ao
 * desmontar, o registro grava o que estiver pendente; se a gravação falhar, o
 * autosaver NÃO é descartado: continua tentando em segundo plano (2s, 5s, 15s,
 * 30s e depois a cada 60s) até salvar, e só então sai do registro. Enquanto
 * houver texto não salvo, fechar a aba pede confirmação, e sair da conta grava
 * antes (com a sessão encerrada o banco recusaria).
 */

const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000]

// autosaver -> { mounted, attempt, timer }
const entries = new Map()

export function hasPendingMinuteSaves() {
  for (const autosaver of entries.keys()) {
    if (autosaver.hasUnsaved()) return true
  }
  return false
}

function warnBeforeClosing(event) {
  if (!hasPendingMinuteSaves()) return
  event.preventDefault()
  event.returnValue = ''
}

let guarding = false
function updateGuard() {
  if (typeof window === 'undefined') return
  const shouldGuard = entries.size > 0
  if (shouldGuard === guarding) return
  guarding = shouldGuard
  if (shouldGuard) window.addEventListener('beforeunload', warnBeforeClosing)
  else window.removeEventListener('beforeunload', warnBeforeClosing)
}

function remove(autosaver) {
  const entry = entries.get(autosaver)
  if (!entry) return
  clearTimeout(entry.timer)
  entries.delete(autosaver)
  autosaver.dispose()
  updateGuard()
}

// Depois do desmonte: sai do registro se salvou; senão agenda a próxima tentativa.
function settle(autosaver) {
  const entry = entries.get(autosaver)
  if (!entry || entry.mounted || entry.timer) return
  if (!autosaver.hasUnsaved()) {
    remove(autosaver)
    return
  }
  const delay = RETRY_DELAYS[Math.min(entry.attempt, RETRY_DELAYS.length - 1)]
  entry.attempt += 1
  entry.timer = setTimeout(() => {
    entry.timer = null
    flushThenSettle(autosaver)
  }, delay)
}

function flushThenSettle(autosaver) {
  const next = () => settle(autosaver)
  autosaver.flush().then(next, next)
}

/** Registra o autosaver da tela montada. Devolve a função a chamar no desmonte. */
export function registerMinuteAutosaver(autosaver) {
  entries.set(autosaver, { mounted: true, attempt: 0, timer: null })
  updateGuard()
  return function release() {
    const entry = entries.get(autosaver)
    if (!entry || !entry.mounted) return
    entry.mounted = false
    flushThenSettle(autosaver)
  }
}

/** Grava tudo o que estiver pendente, montado ou não. true se nada ficou sem salvar. */
export async function flushAllMinuteSaves() {
  const list = [...entries.keys()]
  await Promise.allSettled(list.map((autosaver) => autosaver.flush()))
  for (const autosaver of list) {
    const entry = entries.get(autosaver)
    if (entry && !entry.mounted && !autosaver.hasUnsaved()) remove(autosaver)
  }
  return !hasPendingMinuteSaves()
}
