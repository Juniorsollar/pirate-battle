import type { Rect } from './types'

export const TILE = 64

export type IslandKind = 'sand' | 'grass'

export interface IslandDef {
  kind: IslandKind
  /** top-left tile column / row in the arena */
  col: number
  row: number
}

/** Island shapes in the tilesheet (16 columns of 64px tiles). */
export const ISLAND_SHAPES: Record<IslandKind, { sheetCol: number; sheetRow: number; size: number; inset: number }> = {
  sand: { sheetCol: 0, sheetRow: 0, size: 3, inset: 12 },
  grass: { sheetCol: 5, sheetRow: 0, size: 4, inset: 10 },
}

export const ISLANDS: readonly IslandDef[] = [
  { kind: 'grass', col: 4, row: 2 },
  { kind: 'grass', col: 22, row: 2 },
  { kind: 'sand', col: 7, row: 10 },
  { kind: 'sand', col: 22, row: 10 },
  { kind: 'sand', col: 14, row: 13 },
]

/** Collision rects of the islands (the tile footprint minus the transparent rounded border). */
export function islandRects(islands: readonly IslandDef[] = ISLANDS): Rect[] {
  return islands.map(({ kind, col, row }) => {
    const { size, inset } = ISLAND_SHAPES[kind]
    return { x: col * TILE + inset, y: row * TILE + inset, w: size * TILE - inset * 2, h: size * TILE - inset * 2 }
  })
}
