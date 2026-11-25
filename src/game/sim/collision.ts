import type { Rect } from './types'

export function pointInRect(x: number, y: number, r: Rect, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad
}

export function circleIntersectsRect(x: number, y: number, radius: number, r: Rect) {
  const dx = x - Math.max(r.x, Math.min(x, r.x + r.w))
  const dy = y - Math.max(r.y, Math.min(y, r.y + r.h))
  return dx * dx + dy * dy < radius * radius
}

/** Moves a circle out of a rect along the shortest axis. Returns true if it was pushed. */
export function pushCircleOutOfRect(body: { x: number; y: number }, radius: number, r: Rect): boolean {
  const cx = Math.max(r.x, Math.min(body.x, r.x + r.w))
  const cy = Math.max(r.y, Math.min(body.y, r.y + r.h))
  const dx = body.x - cx
  const dy = body.y - cy
  const distSq = dx * dx + dy * dy
  if (distSq >= radius * radius) return false

  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq)
    body.x = cx + (dx / dist) * radius
    body.y = cy + (dy / dist) * radius
    return true
  }

  // Center inside the rect: exit through the nearest side.
  const left = body.x - r.x
  const right = r.x + r.w - body.x
  const top = body.y - r.y
  const bottom = r.y + r.h - body.y
  const min = Math.min(left, right, top, bottom)
  if (min === left) body.x = r.x - radius
  else if (min === right) body.x = r.x + r.w + radius
  else if (min === top) body.y = r.y - radius
  else body.y = r.y + r.h + radius
  return true
}

/** Slab test: does the segment cross the rect (expanded by pad)? */
export function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, r: Rect, pad = 0) {
  let tMin = 0
  let tMax = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const axes: [number, number, number, number][] = [
    [x1, dx, r.x - pad, r.x + r.w + pad],
    [y1, dy, r.y - pad, r.y + r.h + pad],
  ]
  for (const [origin, delta, lo, hi] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < lo || origin > hi) return false
      continue
    }
    let t1 = (lo - origin) / delta
    let t2 = (hi - origin) / delta
    if (t1 > t2) [t1, t2] = [t2, t1]
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return false
  }
  return true
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}
