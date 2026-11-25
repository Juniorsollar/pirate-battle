/** All gameplay tuning lives here. Systems only read these values, so balancing never touches game logic. */

export interface ShipStats {
  maxHealth: number
  /** px/s */
  moveSpeed: number
  /** rad/s */
  turnSpeed: number
  /** collision radius, px */
  radius: number
}

export interface WeaponStats {
  damage: number
  /** px/s */
  projectileSpeed: number
  /** max distance travelled before the projectile expires, px */
  range: number
  /** seconds between shots */
  cooldown: number
}

export interface GameConfig {
  session: {
    /** active play time, seconds (60–180) */
    durationSec: number
    /** seconds between enemy spawns */
    spawnIntervalSec: number
    /** relative weights used to pick the type of each spawn */
    spawnWeights: { chaser: number; shooter: number }
    maxEnemies: number
    /** spawns never happen closer than this to the player, px */
    spawnMinDistance: number
  }
  arena: { width: number; height: number }
  player: ShipStats & {
    front: WeaponStats
    side: WeaponStats & { count: number; spacing: number }
  }
  chaser: ShipStats & { impactDamage: number }
  shooter: ShipStats & {
    weapon: WeaponStats
    /** starts firing inside this distance (with line of sight), px */
    attackRange: number
    /** stops advancing inside this distance, px */
    preferredDistance: number
    /** max angle between heading and target to fire, rad */
    aimTolerance: number
  }
  /** health ratios at which ships switch to damaged / heavily damaged sprites */
  damageStages: { damaged: number; heavy: number }
}

export const OPTION_LIMITS = {
  durationSec: { min: 60, max: 180, step: 10 },
  spawnIntervalSec: { min: 1, max: 10, step: 1 },
} as const

export const DEFAULT_CONFIG: GameConfig = {
  session: {
    durationSec: 120,
    spawnIntervalSec: 3,
    spawnWeights: { chaser: 1, shooter: 1 },
    maxEnemies: 10,
    spawnMinDistance: 520,
  },
  arena: { width: 1920, height: 1080 },
  player: {
    maxHealth: 100,
    moveSpeed: 170,
    turnSpeed: 2.6,
    radius: 26,
    front: { damage: 25, projectileSpeed: 620, range: 560, cooldown: 0.45 },
    side: { damage: 20, projectileSpeed: 540, range: 420, cooldown: 1.2, count: 3, spacing: 26 },
  },
  chaser: { maxHealth: 40, moveSpeed: 120, turnSpeed: 2.2, radius: 24, impactDamage: 20 },
  shooter: {
    maxHealth: 60,
    moveSpeed: 95,
    turnSpeed: 1.8,
    radius: 26,
    weapon: { damage: 8, projectileSpeed: 420, range: 520, cooldown: 1.8 },
    attackRange: 480,
    preferredDistance: 320,
    aimTolerance: 0.25,
  },
  damageStages: { damaged: 0.66, heavy: 0.33 },
}

export interface PlayerOptions {
  durationSec: number
  spawnIntervalSec: number
}

export const DEFAULT_OPTIONS: PlayerOptions = {
  durationSec: DEFAULT_CONFIG.session.durationSec,
  spawnIntervalSec: DEFAULT_CONFIG.session.spawnIntervalSec,
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
export type ConfigOverrides = DeepPartial<GameConfig>

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key]
    if (value && typeof value === 'object' && current && typeof current === 'object') {
      mergeInto(current as Record<string, unknown>, value as Record<string, unknown>)
    } else if (key in target && typeof value === typeof current) {
      target[key] = value
    }
  }
}

/**
 * Immutable snapshot used by one match; later option changes only affect new matches.
 * `overrides` lets tests build reproducible scenarios (e.g. no spawns) with the real rules.
 */
export function createMatchConfig(options: PlayerOptions, overrides?: ConfigOverrides, base: GameConfig = DEFAULT_CONFIG): Readonly<GameConfig> {
  const config = structuredClone(base)
  if (overrides) mergeInto(config as unknown as Record<string, unknown>, overrides as Record<string, unknown>)
  config.session.durationSec = options.durationSec
  config.session.spawnIntervalSec = options.spawnIntervalSec
  return deepFreeze(config)
}
