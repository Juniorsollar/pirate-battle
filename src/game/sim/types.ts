export type ShipKind = 'player' | 'chaser' | 'shooter'
export type Faction = 'player' | 'enemy'
export type EndReason = 'time_up' | 'destroyed'
export type MatchStatus = 'running' | 'ended'

export interface Ship {
  id: number
  kind: ShipKind
  x: number
  y: number
  /** heading in radians; forward = (cos, sin) */
  angle: number
  health: number
  maxHealth: number
  radius: number
  alive: boolean
  /** seconds until each weapon can fire again */
  cooldowns: { front: number; side: number }
}

export interface Projectile {
  id: number
  faction: Faction
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  /** distance left before expiring, px */
  remaining: number
  alive: boolean
}

export interface InputState {
  forward: boolean
  turnLeft: boolean
  turnRight: boolean
  fireFront: boolean
  fireLeft: boolean
  fireRight: boolean
}

export const EMPTY_INPUT: Readonly<InputState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
})

export type SimEvent =
  | { type: 'shot'; faction: Faction; weapon: 'front' | 'side'; x: number; y: number; angle: number }
  | { type: 'hit'; targetId: number; x: number; y: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'shipDestroyed'; id: number; kind: ShipKind; x: number; y: number; angle: number; byPlayer: boolean }
  | { type: 'spawn'; id: number; kind: ShipKind }
  | { type: 'matchEnded'; reason: EndReason }

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
