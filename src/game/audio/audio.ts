import type { SimEvent } from '../sim/types'

/** Provided WAV files (public/assets/sounds), grouped by role; variants are picked at random. */
const SOUNDS = {
  cannonFire: ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'],
  broadside: ['cannon_broadside'],
  waterHit: ['cannonball_water_hit_1', 'cannonball_water_hit_2'],
  woodHit: ['ship_wood_hit_1', 'ship_wood_hit_2'],
  explosion: ['ship_explosion_1', 'ship_explosion_2'],
  collision: ['ship_collision'],
  sinking: ['ship_sinking'],
  scorePoint: ['score_point'],
  healthLow: ['health_low'],
  timeWarning: ['time_warning'],
  gameStart: ['game_start'],
  gamePause: ['game_pause'],
  gameResume: ['game_resume'],
  gameComplete: ['game_complete'],
  gameOver: ['game_over'],
  uiClick: ['ui_click'],
  ocean: ['ocean_ambience_loop'],
  sailing: ['ship_sailing_loop'],
} as const

export type Sound = keyof typeof SOUNDS
type Loop = 'ocean' | 'sailing'

const MUTE_KEY = 'pirate-battle:sound-muted:v1'
const BASE = `${import.meta.env.BASE_URL}assets/sounds/`

/**
 * Game audio on the Web Audio API. Buffers are fetched and decoded once, in the background, after
 * the first user gesture (autoplay policy); a sound that is not ready yet is simply skipped, and
 * audio failures never affect the game. In tests (`?test`) audio is off unless `?sound` is present.
 */
class AudioManager {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private readonly buffers = new Map<string, AudioBuffer>()
  private loading: Promise<void> | null = null
  private readonly loops = new Map<Loop, { source: AudioBufferSourceNode; gain: GainNode }>()
  private muted = localStorage.getItem(MUTE_KEY) === 'true'
  private readonly listeners = new Set<() => void>()
  /** How many times each sound actually played (for tests and debugging). */
  readonly played: Partial<Record<Sound, number>> = {}
  readonly enabled: boolean

  constructor() {
    const params = new URLSearchParams(location.search)
    this.enabled = typeof AudioContext !== 'undefined' && (!params.has('test') || params.has('sound'))
  }

  /** Call from a user gesture (e.g. the Play button). */
  unlock() {
    if (!this.enabled) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : 0.7
        this.master.connect(this.context.destination)
      }
      void this.context.resume().catch(() => undefined)
      this.loading ??= this.loadAll()
    } catch (error) {
      console.warn('Audio unavailable', error)
    }
  }

  /** Resolves when every buffer has been tried (decoded or skipped). */
  ready() {
    return this.loading ?? Promise.resolve()
  }

  private async loadAll() {
    const context = this.context
    if (!context) return
    const files = [...new Set(Object.values(SOUNDS).flat())]
    await Promise.all(
      files.map(async (file) => {
        try {
          const response = await fetch(`${BASE}${file}.wav`)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          this.buffers.set(file, await context.decodeAudioData(await response.arrayBuffer()))
        } catch (error) {
          console.warn(`Sound ${file} unavailable`, error)
        }
      }),
    )
  }

  private source(sound: Sound) {
    const variants = SOUNDS[sound]
    const buffer = this.buffers.get(variants[Math.floor(Math.random() * variants.length)]!)
    if (!this.context || !this.master || !buffer) return null
    const source = this.context.createBufferSource()
    source.buffer = buffer
    const gain = this.context.createGain()
    source.connect(gain).connect(this.master)
    return { source, gain }
  }

  play(sound: Sound, volume = 1, rate = 1) {
    const node = this.source(sound)
    if (!node) return
    node.gain.gain.value = volume
    node.source.playbackRate.value = rate
    node.source.start()
    this.played[sound] = (this.played[sound] ?? 0) + 1
  }

  loop(sound: Loop, on: boolean, volume = 1) {
    const current = this.loops.get(sound)
    if (!on) {
      current?.source.stop()
      this.loops.delete(sound)
      return
    }
    if (current) return
    const node = this.source(sound)
    if (!node) return
    node.source.loop = true
    node.gain.gain.value = volume
    node.source.start()
    this.loops.set(sound, node)
  }

  stopLoops() {
    for (const loop of [...this.loops.keys()]) this.loop(loop, false)
  }

  /** Turns simulation events into sounds; each sound plays at most once per batch of events. */
  handleEvents(events: readonly SimEvent[], playerId: number) {
    const batch = new Set<Sound>()
    const once = (sound: Sound, volume?: number, rate?: number) => {
      if (batch.has(sound)) return
      batch.add(sound)
      this.play(sound, volume, rate)
    }
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.weapon === 'side') once('broadside', 0.8)
          else if (event.faction === 'player') once('cannonFire', 0.7)
          else once('cannonFire', 0.35, 0.85)
          break
        case 'splash':
          once('waterHit', 0.35)
          break
        case 'hit':
          once('woodHit', event.targetId === playerId ? 0.9 : 0.6)
          break
        case 'shipDestroyed':
          if (event.kind === 'player') once('sinking', 0.9)
          else {
            once('explosion', 0.8)
            if (event.byPlayer) once('scorePoint', 0.5)
            else once('collision', 0.9)
          }
          break
        case 'matchEnded':
          once(event.reason === 'time_up' ? 'gameComplete' : 'gameOver', 0.8)
          break
        default:
          break
      }
    }
  }

  isMuted() {
    return this.muted
  }

  setMuted(muted: boolean) {
    this.muted = muted
    localStorage.setItem(MUTE_KEY, String(muted))
    if (this.master) this.master.gain.value = muted ? 0 : 0.7
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const audio = new AudioManager()

declare global {
  interface Window {
    __PIRATE_AUDIO__?: AudioManager
  }
}

if (new URLSearchParams(location.search).has('test')) window.__PIRATE_AUDIO__ = audio
