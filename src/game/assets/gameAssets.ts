import { Assets, Rectangle, Texture, type Spritesheet } from 'pixi.js'
import { TILE } from '../sim/arenaMap'

export interface GameTextures {
  ships: Spritesheet
  ui: Spritesheet
  tiles: Texture
  water: Texture
  /** 64x64 tile from the tilesheet by column/row */
  tile(col: number, row: number): Texture
}

const BASE = `${import.meta.env.BASE_URL}assets`

let attempts = 0

function manifest() {
  const retina = window.devicePixelRatio >= 1.5
  const params = new URLSearchParams(location.search)
  // Test-only fault injection: the first attempt requests a file that does not exist.
  const broken = params.has('test') && params.has('failAssetsOnce') && attempts === 1
  return {
    ships: `${BASE}/spritesheet/${broken ? 'missing_sheet' : 'ships_miscellaneous_sheet'}.json`,
    ui: `${BASE}/spritesheet/${retina ? 'ui_sheet_retina' : 'ui_sheet'}.json`,
    tiles: `${BASE}/tilesheet/tiles_sheet.png`,
    water: `${BASE}/png/default/tiles/tile_73.png`,
  }
}

let loaded: GameTextures | null = null

/** Loads every texture the match needs once; later matches reuse the cached result. */
export async function loadGameAssets(onProgress: (progress: number) => void): Promise<GameTextures> {
  if (loaded) {
    onProgress(1)
    return loaded
  }
  attempts += 1
  const urls = manifest()
  // PixiJS caches successful loads and drops failed ones, so a retry only refetches what failed.
  const result = await Assets.load<Spritesheet | Texture>(Object.values(urls), onProgress)
  // A failed asset must never reach the match: validate every entry before starting.
  const isSheet = (value: unknown): value is Spritesheet => value instanceof Object && 'textures' in value
  if (!isSheet(result[urls.ships]) || !isSheet(result[urls.ui]) || !(result[urls.tiles] instanceof Texture) || !(result[urls.water] instanceof Texture)) {
    throw new Error('Some game assets are missing or invalid')
  }
  const tiles = result[urls.tiles] as Texture
  const tileCache = new Map<number, Texture>()
  loaded = {
    ships: result[urls.ships] as Spritesheet,
    ui: result[urls.ui] as Spritesheet,
    tiles,
    water: result[urls.water] as Texture,
    tile(col, row) {
      const key = row * 16 + col
      let texture = tileCache.get(key)
      if (!texture) {
        texture = new Texture({ source: tiles.source, frame: new Rectangle(col * TILE, row * TILE, TILE, TILE) })
        tileCache.set(key, texture)
      }
      return texture
    },
  }
  return loaded
}
