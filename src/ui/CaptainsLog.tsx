import { useRef, useState, type KeyboardEvent } from 'react'
import { describeError } from '../api/client'
import type { MatchSettings, Page } from '../api/contracts'
import { configKey } from '../api/contracts'
import type { Player } from '../api/player'
import { useHistory, useRanking } from '../api/queries'
import { MenuButton, Panel, RoundButton } from './components'
import { formatDate, formatTime, REASON_LABEL } from './format'

export type LogTab = 'ranking' | 'history'

const TABS: { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
]

export function CaptainsLog({ initialTab, player, settings, onBack }: { initialTab: LogTab; player: Player; settings: MatchSettings; onBack: () => void }) {
  const [tab, setTab] = useState<LogTab>(initialTab)
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null })

  const onTabKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const next = tab === 'ranking' ? 'history' : 'ranking'
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <Panel wide labelledBy="log-title">
      <h1 id="log-title" className="panel-title">
        Captain&apos;s Log
      </h1>
      <div className="tabs" role="tablist" aria-label="Captain's Log">
        {TABS.map(({ id, label }) => (
          <MenuButton
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el
            }}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            variant={tab === id ? 'primary' : 'secondary'}
            className="tab"
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {label}
          </MenuButton>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="log-panel">
        {tab === 'ranking' ? <RankingTab player={player} settings={settings} /> : <HistoryTab player={player} />}
      </div>
      <MenuButton onClick={onBack}>Main Menu</MenuButton>
    </Panel>
  )
}

function RankingTab({ player, settings }: { player: Player; settings: MatchSettings }) {
  const [page, setPage] = useState(1)
  const query = useRanking(configKey(settings), page)
  return (
    <>
      <p className="tagline">
        {settings.durationSec} second battles · {settings.spawnIntervalSec} second spawn interval
      </p>
      <QueryView query={query} emptyText="No battles with this configuration yet. Be the first!" caption="Ranking">
        {(data) => (
          <table className="log-table">
            <caption className="sr-only">Ranking, page {data.page} of {data.totalPages}</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => {
                const you = entry.playerId === player.playerId
                return (
                  <tr key={entry.matchId} className={you ? 'is-you' : undefined}>
                    <td>{String(entry.rank).padStart(2, '0')}</td>
                    <td>
                      {entry.playerName}
                      {you && <span className="badge">You</span>}
                    </td>
                    <td className="points">{entry.score}</td>
                    <td>{formatDate(entry.playedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </QueryView>
      <Pagination page={page} totalPages={query.data?.totalPages ?? 1} onChange={setPage} label="Ranking" />
    </>
  )
}

function HistoryTab({ player }: { player: Player }) {
  const [page, setPage] = useState(1)
  const query = useHistory(player.playerId, page)
  return (
    <>
      <p className="tagline">{player.playerName} · your recent battles</p>
      <QueryView query={query} emptyText="No battles yet. Finish a match to fill your log." caption="Match history">
        {(data) => (
          <table className="log-table">
            <caption className="sr-only">Match history, page {data.page} of {data.totalPages}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((record) => (
                <tr key={record.matchId}>
                  <td>{formatDate(record.playedAt)}</td>
                  <td className="points">{record.score}</td>
                  <td>{formatTime(record.durationSec)}</td>
                  <td className={`reason reason--${record.endReason}`}>{REASON_LABEL[record.endReason]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
      <Pagination page={page} totalPages={query.data?.totalPages ?? 1} onChange={setPage} label="Match history" />
    </>
  )
}

interface QueryLike<T> {
  data: Page<T> | undefined
  error: unknown
  isPending: boolean
  isError: boolean
  isFetching: boolean
  isPlaceholderData: boolean
  refetch: () => unknown
}

function QueryView<T>({ query, emptyText, caption, children }: { query: QueryLike<T>; emptyText: string; caption: string; children: (data: Page<T>) => React.ReactNode }) {
  if (query.isPending) {
    return (
      <p className="log-state" role="status">
        Loading {caption.toLowerCase()}…
      </p>
    )
  }
  if (query.isError && !query.data) {
    return (
      <div className="log-state">
        <p className="error" role="alert">
          Could not load the {caption.toLowerCase()}. {describeError(query.error)}
        </p>
        <MenuButton variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </MenuButton>
      </div>
    )
  }
  const data = query.data!
  return (
    <>
      <p className="log-refresh" role="status">
        {query.isFetching ? 'Updating…' : query.isError ? 'Showing saved data: the latest update failed.' : ''}
      </p>
      {data.items.length === 0 ? <p className="log-state">{emptyText}</p> : <div aria-busy={query.isPlaceholderData}>{children(data)}</div>}
    </>
  )
}

function Pagination({ page, totalPages, onChange, label }: { page: number; totalPages: number; onChange: (page: number) => void; label: string }) {
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <RoundButton icon="turn_left" label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <RoundButton icon="turn_right" label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)} />
    </nav>
  )
}
