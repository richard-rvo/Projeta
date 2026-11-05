const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

/** 'YYYY-MM-DDTHH:mm' -> 'dd/mm hh:mm' ('' se não houver data). */
export function formatMeetingAt(meetingAt) {
  const m = STAMP.exec(meetingAt || '')
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : ''
}

/**
 * Agrupa por mês da reunião, mais recente primeiro. Atas sem data vão para o
 * grupo final 'Sem data'. Retorna [{ key, label, items }].
 */
export function groupMinutesByMonth(minutes) {
  const sorted = [...minutes].sort((a, b) => (b.meetingAt || '').localeCompare(a.meetingAt || ''))
  const groups = []
  const byKey = new Map()
  const undated = []
  for (const minute of sorted) {
    const m = STAMP.exec(minute.meetingAt || '')
    if (!m) {
      undated.push(minute)
      continue
    }
    const key = `${m[1]}-${m[2]}`
    if (!byKey.has(key)) {
      const group = { key, label: `${MONTHS[Number(m[2]) - 1]} de ${m[1]}`, items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    byKey.get(key).items.push(minute)
  }
  if (undated.length) groups.push({ key: 'none', label: 'Sem data', items: undated })
  return groups
}
