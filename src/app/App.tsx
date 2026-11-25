import { useEffect, useState } from 'react'
import { configKey, type MatchRecord } from '../api/contracts'
import { getPlayer } from '../api/player'
import { useMatchSubmitter } from '../api/queries'
import { createMatchConfig, type ConfigOverrides, type PlayerOptions } from '../config/gameConfig'
import { loadOptions } from '../config/options'
import type { MatchResult } from '../game/GameSession'
import { CaptainsLog, type LogTab } from '../ui/CaptainsLog'
import { MainMenu } from '../ui/MainMenu'
import { MatchScreen, type MatchSetup } from '../ui/MatchScreen'
import { OptionsScreen } from '../ui/OptionsScreen'
import { ResultScreen } from '../ui/ResultScreen'
import { loadLastResult, saveLastResult } from './lastResult'
import '../ui/ui.css'

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'log'; tab: LogTab }
  | { name: 'match'; setup: MatchSetup }
  | { name: 'result'; record: MatchRecord }

/** Only the result screen survives a refresh (#result); a match in progress is abandoned. */
const RESULT_HASH = '#result'

/** Test mode only (`?test&overrides={...}`): tuning overrides for reproducible E2E scenarios. */
function testOverrides(params: URLSearchParams): ConfigOverrides | undefined {
  if (!params.has('test')) return undefined
  try {
    return JSON.parse(params.get('overrides') ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

function newMatch(options: PlayerOptions): MatchSetup {
  const params = new URLSearchParams(location.search)
  const seedParam = params.get('seed')
  const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : Math.floor(Math.random() * 2 ** 32)
  // Snapshot: changing options later only affects new matches.
  return { id: crypto.randomUUID(), config: createMatchConfig(options, testOverrides(params)), seed }
}

function initialScreen(): Screen {
  const last = loadLastResult()
  return location.hash === RESULT_HASH && last ? { name: 'result', record: last } : { name: 'menu' }
}

export function App() {
  const [player] = useState(getPlayer)
  const [options, setOptions] = useState<PlayerOptions>(loadOptions)
  const [lastResult, setLastResult] = useState<MatchRecord | null>(loadLastResult)
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const { submit, flush } = useMatchSubmitter()

  // Resend matches left pending by a failure or a refresh, now and whenever the network may be back.
  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    window.addEventListener('scenario-change', flush)
    return () => {
      window.removeEventListener('online', flush)
      window.removeEventListener('scenario-change', flush)
    }
  }, [flush])

  useEffect(() => {
    const hash = screen.name === 'result' ? RESULT_HASH : ''
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
  }, [screen.name])

  const play = () => setScreen({ name: 'match', setup: newMatch(options) })
  const menu = () => setScreen({ name: 'menu' })

  const finishMatch = (setup: MatchSetup, result: MatchResult) => {
    const settings = { durationSec: setup.config.session.durationSec, spawnIntervalSec: setup.config.session.spawnIntervalSec }
    const record: MatchRecord = {
      matchId: setup.id,
      playerId: player.playerId,
      playerName: player.playerName,
      playedAt: result.endedAt,
      score: result.score,
      durationSec: result.durationSec,
      endReason: result.reason,
      config: settings,
      configKey: configKey(settings),
    }
    saveLastResult(record)
    setLastResult(record)
    submit(record)
    setScreen({ name: 'result', record })
  }

  return (
    <main className={`app app--${screen.name}`}>
      {screen.name === 'menu' && (
        <MainMenu
          lastResult={lastResult}
          onPlay={play}
          onOptions={() => setScreen({ name: 'options' })}
          onLog={(tab) => setScreen({ name: 'log', tab })}
          onRetryPending={flush}
        />
      )}
      {screen.name === 'options' && <OptionsScreen initial={options} onSaved={setOptions} onBack={menu} />}
      {screen.name === 'log' && <CaptainsLog initialTab={screen.tab} player={player} settings={options} onBack={menu} />}
      {screen.name === 'match' && (
        <MatchScreen key={screen.setup.id} setup={screen.setup} onExit={menu} onEnd={(result) => finishMatch(screen.setup, result)} />
      )}
      {screen.name === 'result' && <ResultScreen record={screen.record} onPlayAgain={play} onMenu={menu} onRetrySave={submit} />}
    </main>
  )
}
