import { configKey, type MatchRecord, type MatchSettings } from '../api/contracts'
import { createRng } from '../game/sim/rng'

const CAPTAINS = ['Captain Flint', 'Red Sparrow', 'Storm Rider', 'Sea Wolf', 'Iron Hook', 'Salty Meg', 'Black Finn', 'Gale Morgan']

/** Deterministic records of other players (same output on every run). */
export function generateRecords(count: number, settings: MatchSettings, seed: number, player?: { playerId: string; playerName: string }): MatchRecord[] {
  const rng = createRng(seed)
  const start = Date.UTC(2026, 8, 8, 18, 0, 0)
  return Array.from({ length: count }, (_, i) => {
    const captainIndex = Math.floor(rng() * CAPTAINS.length)
    const destroyed = rng() < 0.4
    const durationSec = destroyed ? Math.round(settings.durationSec * (0.4 + rng() * 0.5)) : settings.durationSec
    return {
      matchId: `fixture-${seed}-${i}`,
      playerId: player?.playerId ?? `fixture-player-${captainIndex}`,
      playerName: player?.playerName ?? CAPTAINS[captainIndex]!,
      playedAt: new Date(start - i * 37 * 60_000).toISOString(),
      score: Math.round((durationSec / 120) * (8 + rng() * 30)),
      durationSec,
      endReason: destroyed ? 'destroyed' : 'time_up',
      config: settings,
      configKey: configKey(settings),
    }
  })
}

/** Initial content of the mock database: other captains on a few configurations. */
export function initialRecords(): MatchRecord[] {
  return [
    ...generateRecords(14, { durationSec: 120, spawnIntervalSec: 3 }, 1),
    ...generateRecords(4, { durationSec: 60, spawnIntervalSec: 3 }, 2),
    ...generateRecords(3, { durationSec: 180, spawnIntervalSec: 5 }, 3),
  ]
}
