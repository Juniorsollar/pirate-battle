import { circleIntersectsRect } from './collision'
import type { Rect } from './types'

const NEIGHBORS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/**
 * BFS flow field over a coarse grid towards the player. Enemies follow it when islands block
 * the direct line, so they never get stuck behind an island. Rebuilt only when the player changes cell.
 */
export class FlowField {
  private readonly cols: number
  private readonly rows: number
  private readonly blocked: Uint8Array
  private readonly dist: Int32Array
  private targetCell = -1

  private readonly cell: number

  constructor(width: number, height: number, obstacles: readonly Rect[], clearance: number, cell = 32) {
    this.cell = cell
    this.cols = Math.ceil(width / cell)
    this.rows = Math.ceil(height / cell)
    this.blocked = new Uint8Array(this.cols * this.rows)
    this.dist = new Int32Array(this.cols * this.rows)
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cx = (col + 0.5) * cell
        const cy = (row + 0.5) * cell
        if (obstacles.some((r) => circleIntersectsRect(cx, cy, clearance, r))) this.blocked[row * this.cols + col] = 1
      }
    }
  }

  private index(x: number, y: number) {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)))
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)))
    return row * this.cols + col
  }

  private passable(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows && !this.blocked[row * this.cols + col]
  }

  update(targetX: number, targetY: number) {
    const target = this.index(targetX, targetY)
    if (target === this.targetCell) return
    this.targetCell = target
    this.dist.fill(-1)
    this.dist[target] = 0
    const queue = new Int32Array(this.cols * this.rows)
    let head = 0
    let tail = 0
    queue[tail++] = target
    while (head < tail) {
      const current = queue[head++]!
      const col = current % this.cols
      const row = (current - col) / this.cols
      for (const [dc, dr] of NEIGHBORS) {
        const nc = col + dc
        const nr = row + dr
        if (!this.passable(nc, nr)) continue
        // No corner cutting through blocked cells.
        if (dc !== 0 && dr !== 0 && (!this.passable(col + dc, row) || !this.passable(col, row + dr))) continue
        const next = nr * this.cols + nc
        if (this.dist[next] !== -1) continue
        this.dist[next] = this.dist[current]! + 1
        queue[tail++] = next
      }
    }
  }

  /** Point to steer to from (x, y), or null when already at the target or unreachable. */
  nextWaypoint(x: number, y: number): { x: number; y: number } | null {
    const current = this.index(x, y)
    const col = current % this.cols
    const row = (current - col) / this.cols
    let best = -1
    let bestDist = this.dist[current]! >= 0 ? this.dist[current]! : Number.MAX_SAFE_INTEGER
    for (const [dc, dr] of NEIGHBORS) {
      const nc = col + dc
      const nr = row + dr
      if (!this.passable(nc, nr)) continue
      const d = this.dist[nr * this.cols + nc]!
      if (d >= 0 && d < bestDist) {
        bestDist = d
        best = nr * this.cols + nc
      }
    }
    if (best < 0) return null
    const bc = best % this.cols
    return { x: (bc + 0.5) * this.cell, y: ((best - bc) / this.cols + 0.5) * this.cell }
  }
}
