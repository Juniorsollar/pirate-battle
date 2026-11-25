/**
 * Minimal external store for React's useSyncExternalStore. `set` notifies only when a value
 * actually changes, so the game can call it every frame without re-rendering React every frame.
 */
export interface Store<T extends object> {
  get(): T
  set(patch: Partial<T>): void
  subscribe(listener: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      const changed = (Object.keys(patch) as (keyof T)[]).some((key) => !Object.is(state[key], patch[key]))
      if (!changed) return
      state = { ...state, ...patch }
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type MatchPhase = 'running' | 'paused' | 'ended'

export interface HudState {
  phase: MatchPhase
  health: number
  maxHealth: number
  score: number
  /** whole seconds left, so the HUD updates once per second */
  timeLeft: number
}
