import { useEffect, useRef } from 'react'
import type { MatchRecord } from '../api/contracts'
import { useOutbox } from '../api/queries'
import { ControlsHelp, MenuButton, Panel, SoundToggle } from './components'
import type { LogTab } from './CaptainsLog'
import { formatTime, REASON_LABEL } from './format'
import { ScenarioPanel } from './ScenarioPanel'

interface Props {
  lastResult: MatchRecord | null
  onPlay: () => void
  onOptions: () => void
  onLog: (tab: LogTab) => void
  onRetryPending: () => void
}

export function MainMenu({ lastResult, onPlay, onOptions, onLog, onRetryPending }: Props) {
  const playRef = useRef<HTMLButtonElement>(null)
  useEffect(() => playRef.current?.focus(), [])
  const pending = useOutbox()
  const waiting = pending.filter((e) => e.status !== 'sending').length

  return (
    <Panel labelledBy="menu-title">
      <h1 id="menu-title" className="title-image">
        <img src="/assets/png/default/ui/menu/title_pirate_battle.png" alt="Pirate Battle" />
      </h1>
      <p className="tagline">Set sail. Take command.</p>
      <div className="stack">
        <MenuButton ref={playRef} onClick={onPlay}>
          Play
        </MenuButton>
        <MenuButton onClick={onOptions}>Options</MenuButton>
      </div>

      {lastResult && (
        <p className="last-result">
          Last battle: <strong>{lastResult.score} points</strong> · {formatTime(lastResult.durationSec)} · {REASON_LABEL[lastResult.endReason]}
        </p>
      )}
      {pending.length > 0 && (
        <div className="pending" role="status">
          <span>{pending.length === 1 ? '1 battle waiting to be saved.' : `${pending.length} battles waiting to be saved.`}</span>
          {waiting > 0 && (
            <button type="button" className="link-button" onClick={onRetryPending}>
              Retry now
            </button>
          )}
        </div>
      )}

      <div className="log-buttons">
        <MenuButton variant="secondary" onClick={() => onLog('ranking')}>
          Ranking
        </MenuButton>
        <MenuButton variant="secondary" onClick={() => onLog('history')}>
          Match History
        </MenuButton>
      </div>

      <h2 className="section-title">Controls</h2>
      <ControlsHelp />
      <SoundToggle />
      <ScenarioPanel />
    </Panel>
  )
}
