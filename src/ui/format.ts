export function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

/** "08 SEP · 19:36" */
export function formatDate(iso: string) {
  const date = new Date(iso)
  return `${String(date.getDate()).padStart(2, '0')} ${monthFormat.format(date).toUpperCase()} · ${timeFormat.format(date)}`
}

export const REASON_LABEL = { time_up: 'Time up', destroyed: 'Defeated' } as const
