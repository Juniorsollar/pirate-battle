import type { MatchRecord } from '../api/contracts'
import { useOutbox } from '../api/queries'
import { MenuButton } from './components'

/** Shows whether a finished match is registered in the ranking/history, with a manual retry. */
export function SubmissionStatus({ record, onRetry }: { record: MatchRecord; onRetry: (record: MatchRecord) => void }) {
  const entry = useOutbox().find((e) => e.record.matchId === record.matchId)
  const status = entry?.status ?? 'saved'
  const text = {
    saved: 'Battle saved to the Captain’s Log.',
    sending: 'Saving battle…',
    pending: 'Waiting to save this battle.',
    failed: `Battle not saved yet. ${entry?.error ?? ''}`,
  }[status]

  return (
    <div className={`submission submission--${status}`}>
      <p role="status">{text}</p>
      {(status === 'failed' || status === 'pending') && (
        <MenuButton variant="secondary" onClick={() => onRetry(record)}>
          Retry save
        </MenuButton>
      )}
    </div>
  )
}
