import { DEFAULT_OPTIONS, OPTION_LIMITS, type PlayerOptions } from './gameConfig'

const STORAGE_KEY = 'pirate-battle:options:v1'

export type OptionKey = keyof PlayerOptions

export function validateOption(key: OptionKey, value: number): string | null {
  const { min, max } = OPTION_LIMITS[key]
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (!Number.isInteger(value)) return 'Use whole seconds.'
  if (value < min || value > max) return `Must be between ${min} and ${max} seconds.`
  return null
}

export function loadOptions(): PlayerOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_OPTIONS }
    const parsed = JSON.parse(raw) as Partial<Record<OptionKey, unknown>>
    const options = { ...DEFAULT_OPTIONS }
    for (const key of Object.keys(DEFAULT_OPTIONS) as OptionKey[]) {
      const value = parsed[key]
      if (typeof value === 'number' && validateOption(key, value) === null) options[key] = value
    }
    return options
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export function saveOptions(options: PlayerOptions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
}
