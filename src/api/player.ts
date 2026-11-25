const STORAGE_KEY = 'pirate-battle:player:v1'

export interface Player {
  playerId: string
  playerName: string
}

const NAMES = ['Captain Jack', 'Captain Ana', 'Captain Rui', 'Captain Lia', 'Captain Teo', 'Captain Bia']

/** Local player identity, created on the first visit and kept across reloads. */
export function getPlayer(): Player {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Player> | null
    if (stored && typeof stored.playerId === 'string' && typeof stored.playerName === 'string') {
      return { playerId: stored.playerId, playerName: stored.playerName }
    }
  } catch {
    // corrupted value: create a new identity below
  }
  const player = { playerId: crypto.randomUUID(), playerName: NAMES[Math.floor(Math.random() * NAMES.length)]! }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player))
  return player
}
