import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GameConfig } from '../config/gameConfig'
import { GameSession, type MatchResult } from '../game/GameSession'
import { loadGameAssets, type GameTextures } from '../game/assets/gameAssets'
import type { Control } from '../game/input/InputController'
import { ControlsHelp, MenuButton, Panel, RoundButton, SoundToggle } from './components'
import { formatTime } from './format'

export interface MatchSetup {
  id: string
  config: Readonly<GameConfig>
  seed: number
}

type AssetState = { status: 'loading'; progress: number } | { status: 'error' } | { status: 'ready'; textures: GameTextures }

export function MatchScreen({ setup, onEnd, onExit }: { setup: MatchSetup; onEnd: (result: MatchResult) => void; onExit: () => void }) {
  const [assets, setAssets] = useState<AssetState>({ status: 'loading', progress: 0 })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // `done` also stops late progress events (other files still loading) from hiding a failure.
    let done = false
    loadGameAssets((progress) => !done && setAssets({ status: 'loading', progress }))
      .then((textures) => {
        if (done) return
        done = true
        setAssets({ status: 'ready', textures })
      })
      .catch((error: unknown) => {
        console.warn('Failed to load game assets', error)
        if (done) return
        done = true
        setAssets({ status: 'error' })
      })
    return () => {
      done = true
    }
  }, [attempt])

  if (assets.status === 'ready') return <Battle setup={setup} textures={assets.textures} onEnd={onEnd} onExit={onExit} />

  return (
    <Panel labelledBy="loading-title">
      <h1 id="loading-title" className="panel-title">
        {assets.status === 'error' ? 'Loading failed' : 'Preparing the fleet'}
      </h1>
      {assets.status === 'loading' ? (
        <>
          <progress className="progress" max={1} value={assets.progress} aria-labelledby="loading-title" />
          <p className="hint">{Math.round(assets.progress * 100)}%</p>
        </>
      ) : (
        <>
          <p className="error" role="alert">
            The game assets could not be loaded. Check your connection and try again.
          </p>
          <div className="stack">
            <MenuButton
              onClick={() => {
                setAssets({ status: 'loading', progress: 0 })
                setAttempt((n) => n + 1)
              }}
            >
              Retry
            </MenuButton>
            <MenuButton variant="secondary" onClick={onExit}>
              Main Menu
            </MenuButton>
          </div>
        </>
      )}
    </Panel>
  )
}

function Battle({ setup, textures, onEnd, onExit }: { setup: MatchSetup; textures: GameTextures; onEnd: (r: MatchResult) => void; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const manualClock = new URLSearchParams(location.search).has('manualClock')
    const created = new GameSession({ config: setup.config, seed: setup.seed, textures, manualClock, onEnd: (r) => onEndRef.current(r) })
    created.mount(host).catch((error: unknown) => console.error('Failed to start the match', error))
    setSession(created)
    exposeForTests(created)
    return () => {
      created.destroy()
      exposeForTests(null)
    }
  }, [setup, textures])

  return (
    <div className="battle">
      <div className="arena" ref={hostRef} />
      {session && <MatchOverlay session={session} onExit={onExit} />}
    </div>
  )
}

/** Phones and tablets in portrait: the supported orientation is landscape. */
const PORTRAIT_TOUCH = '(orientation: portrait) and (pointer: coarse)'

function subscribePortrait(listener: () => void) {
  const query = matchMedia(PORTRAIT_TOUCH)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

function usePortraitTouch() {
  return useSyncExternalStore(subscribePortrait, () => matchMedia(PORTRAIT_TOUCH).matches)
}

function MatchOverlay({ session, onExit }: { session: GameSession; onExit: () => void }) {
  const hud = useSyncExternalStore(session.store.subscribe, session.store.get)
  const portrait = usePortraitTouch()
  // Rotating to portrait pauses the match; the rules never change with the screen size.
  useEffect(() => {
    if (portrait) session.pause()
  }, [portrait, session])
  const healthRatio = hud.health / hud.maxHealth
  const fill = healthRatio > 0.66 ? 'green' : healthRatio > 0.33 ? 'amber' : 'red'

  return (
    <>
      <header className="hud">
        <div className="hud-health" role="group" aria-label={`Health ${hud.health} of ${hud.maxHealth}`}>
          <img src="/assets/png/default/ui/hud/icon_heart.png" alt="" className="hud-heart" />
          <div className="health-bar">
            <span className={`health-fill health-fill--${fill}`} style={{ width: `${healthRatio * 100}%` }} />
            <span className="health-text" aria-hidden="true">
              {hud.health} / {hud.maxHealth}
            </span>
          </div>
        </div>
        <div className="hud-right">
          <div className="counter" aria-label={`Score ${hud.score}`}>
            <img src="/assets/png/default/ui/hud/icon_score.png" alt="" />
            <span aria-hidden="true">{hud.score}</span>
          </div>
          <div className="counter" aria-label={`Time left ${formatTime(hud.timeLeft)}`}>
            <img src="/assets/png/default/ui/hud/icon_time.png" alt="" />
            <span aria-hidden="true">{formatTime(hud.timeLeft)}</span>
          </div>
          <RoundButton icon="pause" label="Pause" onClick={() => session.pause()} disabled={hud.phase !== 'running'} />
        </div>
      </header>

      <LiveAnnouncements score={hud.score} timeLeft={hud.timeLeft} phase={hud.phase} />
      <TouchControls session={session} />
      <PauseDialog open={hud.phase === 'paused'} portrait={portrait} onResume={() => session.resume()} onExit={onExit} />
    </>
  )
}

const TIME_MILESTONES = [10, 30, 60] as const

/** Screen-reader updates: score/state on change, time only at milestones (never per frame). */
function LiveAnnouncements({ score, timeLeft, phase }: { score: number; timeLeft: number; phase: string }) {
  const milestone = TIME_MILESTONES.find((m) => timeLeft <= m)
  const state = phase === 'paused' ? 'Game paused.' : phase === 'ended' ? 'Battle over.' : ''
  return (
    <div className="sr-only">
      <p aria-live="polite">{`Score ${score}. ${state}`}</p>
      <p aria-live="polite">{milestone ? `${milestone} seconds left.` : ''}</p>
    </div>
  )
}

const TOUCH_LEFT: [Control, string, string][] = [
  ['turnLeft', 'turn_left', 'Turn left'],
  ['forward', 'forward', 'Sail forward'],
  ['turnRight', 'turn_right', 'Turn right'],
]
const TOUCH_RIGHT: [Control, string, string][] = [
  ['fireLeft', 'fire_left', 'Fire left broadside'],
  ['fireFront', 'fire_front', 'Fire bow cannon'],
  ['fireRight', 'fire_right', 'Fire right broadside'],
]

function TouchControls({ session }: { session: GameSession }) {
  const button = ([control, icon, label]: [Control, string, string]) => (
    <RoundButton
      key={control}
      icon={icon}
      label={label}
      className={`touch-button touch-button--${control}`}
      tabIndex={-1}
      onPointerDown={(event) => {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // synthetic or already-released pointers cannot be captured; the press still counts
        }
        session.setTouch(control, true)
      }}
      onPointerUp={() => session.setTouch(control, false)}
      onPointerCancel={() => session.setTouch(control, false)}
      onLostPointerCapture={() => session.setTouch(control, false)}
      onContextMenu={(event) => event.preventDefault()}
    />
  )
  return (
    <div className="touch-controls" aria-hidden="true">
      <div className="touch-pad touch-pad--left">{TOUCH_LEFT.map(button)}</div>
      <div className="touch-pad touch-pad--right">{TOUCH_RIGHT.map(button)}</div>
    </div>
  )
}

function PauseDialog({ open, portrait, onResume, onExit }: { open: boolean; portrait: boolean; onResume: () => void; onExit: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="pause-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!portrait) onResume()
      }}
    >
      <Panel labelledBy="pause-title">
        <h2 id="pause-title" className="panel-title">
          Paused
        </h2>
        {portrait ? (
          <p className="rotate-hint" role="status">
            Rotate your device to landscape to keep playing.
          </p>
        ) : (
          <p className="tagline">Ready when you are.</p>
        )}
        <div className="stack">
          {!portrait && (
            <MenuButton autoFocus onClick={onResume}>
              Resume
            </MenuButton>
          )}
          <MenuButton autoFocus={portrait} onClick={onExit}>
            Main Menu
          </MenuButton>
        </div>
        <SoundToggle />
        <ControlsHelp />
      </Panel>
    </dialog>
  )
}

declare global {
  interface Window {
    __PIRATE_TEST__?: GameSession | null
  }
}

/** Test instrumentation: only exposed with ?test in the URL. */
function exposeForTests(session: GameSession | null) {
  if (new URLSearchParams(location.search).has('test')) window.__PIRATE_TEST__ = session
}
