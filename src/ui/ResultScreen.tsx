import { useEffect, useRef } from 'react'
import type { MatchRecord } from '../api/contracts'
import { MenuButton, Panel } from './components'
import { formatTime } from './format'
import { SubmissionStatus } from './SubmissionStatus'

const REASON_TEXT = { time_up: 'Time up', destroyed: 'Ship destroyed' } as const

export function ResultScreen({ record, onPlayAgain, onMenu, onRetrySave }: { record: MatchRecord; onPlayAgain: () => void; onMenu: () => void; onRetrySave: (record: MatchRecord) => void }) {
  const playRef = useRef<HTMLButtonElement>(null)
  useEffect(() => playRef.current?.focus(), [])

  return (
    <Panel labelledBy="result-title">
      <h1 id="result-title" className="panel-title">
        {record.endReason === 'time_up' ? 'Battle complete' : 'Ship sunk'}
      </h1>
      <p className="result-score" aria-label={`${record.score} points`}>
        {record.score}
      </p>
      <dl className="result-details">
        <div>
          <dt>Points</dt>
          <dd>{record.score}</dd>
        </div>
        <div>
          <dt>Time played</dt>
          <dd>{formatTime(record.durationSec)}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{REASON_TEXT[record.endReason]}</dd>
        </div>
      </dl>
      <SubmissionStatus record={record} onRetry={onRetrySave} />
      <div className="stack">
        <MenuButton ref={playRef} onClick={onPlayAgain}>
          Play Again
        </MenuButton>
        <MenuButton onClick={onMenu}>Main Menu</MenuButton>
      </div>
    </Panel>
  )
}
