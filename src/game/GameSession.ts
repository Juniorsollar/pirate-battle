import { Application, type Ticker } from 'pixi.js'
import type { GameConfig } from '../config/gameConfig'
import type { GameTextures } from './assets/gameAssets'
import { audio } from './audio/audio'
import { InputController, type Control } from './input/InputController'
import { PerfRecorder, perfEnabled } from './perf'
import { GameRenderer } from './render/GameRenderer'
import { Simulation } from './sim/Simulation'
import type { EndReason } from './sim/types'
import { createStore, type HudState, type Store } from './store'

export const FIXED_DT = 1 / 60
/** Longest frame we simulate; avoids huge catch-up after a stall. */
const MAX_FRAME_DT = 0.1
/** HUD thresholds that trigger warning sounds. */
const LOW_HEALTH_RATIO = 0.3
const TIME_WARNING_SEC = 10
/** Real time the final explosion stays on screen before the result screen. */
const END_DELAY_MS = 1200

export interface MatchResult {
  score: number
  durationSec: number
  reason: EndReason
  startedAt: string
  endedAt: string
}

export interface GameSessionOptions {
  config: Readonly<GameConfig>
  seed: number
  textures: GameTextures
  onEnd: (result: MatchResult) => void
  /** Tests drive time with advance(); the ticker then only renders. */
  manualClock?: boolean
}

/**
 * Owns one match: simulation, PixiJS app, renderer and input. Created on mount, destroyed on
 * unmount/restart. `destroy()` is idempotent and safe even while the async init is pending
 * (React Strict Mode mounts, unmounts and mounts again).
 */
export class GameSession {
  readonly store: Store<HudState>
  readonly sim: Simulation
  private readonly input: InputController
  private readonly startedAt = new Date().toISOString()
  private app: Application | null = null
  private renderer: GameRenderer | null = null
  private accumulator = 0
  private destroyed = false
  private endTimer: ReturnType<typeof setTimeout> | null = null
  private manualClock: boolean
  private readonly perf = perfEnabled() ? new PerfRecorder() : null

  private readonly options: GameSessionOptions

  constructor(options: GameSessionOptions) {
    this.options = options
    this.sim = new Simulation(options.config, options.seed)
    this.input = new InputController(() => this.pause())
    this.manualClock = options.manualClock ?? false
    this.store = createStore<HudState>({
      phase: 'running',
      health: this.sim.player.health,
      maxHealth: this.sim.player.maxHealth,
      score: 0,
      timeLeft: Math.ceil(this.sim.timeLeft),
    })
    if (this.perf) window.__PIRATE_PERF__ = this.perf
  }

  async mount(host: HTMLElement) {
    const app = new Application()
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true })
      return
    }
    this.app = app
    app.canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(app.canvas)
    this.renderer = new GameRenderer(app, this.options.textures, this.sim)
    app.renderer.on('resize', this.onResize)
    app.ticker.add(this.onTick)

    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
    // The match may already be paused (e.g. phone in portrait) before the canvas was ready.
    if (this.store.get().phase === 'running') {
      this.input.attach()
      this.startAmbience()
    }
    audio.play('gameStart', 0.6)
    if (document.hidden) this.pause()
  }

  private startAmbience() {
    audio.loop('ocean', true, 0.25)
  }

  private readonly onResize = () => this.renderer?.fit()
  private readonly onBlur = () => this.pause()
  private readonly onVisibility = () => {
    if (document.hidden) this.pause()
  }

  private readonly onTick = (ticker: Ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_FRAME_DT)
    const phase = this.store.get().phase
    if (phase === 'running' && !this.manualClock) this.advance(dt)
    // Explosions keep animating after the end, but not while paused.
    if (phase === 'ended') this.renderer?.updateEffects(dt)
    this.renderer?.sync()
    if (this.perf && phase === 'running' && this.renderer) {
      const renderer = this.renderer
      this.perf.record(ticker.deltaMS, () => ({ enemies: this.sim.enemies.length, projectiles: this.sim.projectiles.length, ...renderer.stats() }))
    }
  }

  /** Runs whole fixed steps for `seconds` of game time. */
  advance(seconds: number) {
    if (this.store.get().phase !== 'running' || !this.renderer) return
    this.accumulator += seconds
    let steps = 0
    const input = this.input.read()
    while (this.accumulator >= FIXED_DT - 1e-9) {
      this.accumulator -= FIXED_DT
      this.sim.step(FIXED_DT, input)
      steps += 1
      const events = this.sim.drainEvents()
      this.renderer.handleEvents(events)
      audio.handleEvents(events, this.sim.player.id)
      if (this.sim.status === 'ended') break
    }
    audio.loop('sailing', input.forward && this.sim.status === 'running', 0.3)
    this.renderer.updateEffects(steps * FIXED_DT)
    this.publish()
    if (this.sim.status === 'ended') this.finish()
  }

  private publish() {
    const { player } = this.sim
    const before = this.store.get()
    const timeLeft = Math.ceil(this.sim.timeLeft)
    if (before.health / before.maxHealth > LOW_HEALTH_RATIO && player.health / player.maxHealth <= LOW_HEALTH_RATIO && player.health > 0) audio.play('healthLow', 0.8)
    if (before.timeLeft > TIME_WARNING_SEC && timeLeft <= TIME_WARNING_SEC) audio.play('timeWarning', 0.8)
    this.store.set({ health: player.health, score: this.sim.score, timeLeft })
  }

  private finish() {
    this.accumulator = 0
    this.input.detach()
    audio.stopLoops()
    this.store.set({ phase: 'ended' })
    const result: MatchResult = {
      score: this.sim.score,
      durationSec: Math.round(this.sim.duration * 1000) / 1000,
      reason: this.sim.endReason ?? 'time_up',
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
    }
    this.endTimer = setTimeout(() => this.options.onEnd(result), this.manualClock ? 0 : END_DELAY_MS)
  }

  pause() {
    if (this.store.get().phase !== 'running') return
    this.input.detach()
    this.accumulator = 0
    audio.stopLoops()
    audio.play('gamePause', 0.6)
    this.store.set({ phase: 'paused' })
  }

  /** Resuming needs an explicit player action; nothing from the paused period carries over. */
  resume() {
    if (this.store.get().phase !== 'paused' || this.destroyed) return
    this.accumulator = 0
    this.input.clear()
    this.input.attach()
    audio.play('gameResume', 0.6)
    this.startAmbience()
    this.store.set({ phase: 'running' })
  }

  setTouch(control: Control, pressed: boolean) {
    this.input.setTouch(control, pressed)
  }

  setManualClock(manual: boolean) {
    this.manualClock = manual
    this.accumulator = 0
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    audio.stopLoops()
    if (this.endTimer) clearTimeout(this.endTimer)
    this.input.detach()
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    if (this.app) {
      this.app.ticker.remove(this.onTick)
      this.app.renderer.off('resize', this.onResize)
      this.renderer?.destroy()
      // Keep shared atlas textures alive for the next match.
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })
    }
    this.app = null
    this.renderer = null
  }
}
