import type { GameConfig, WeaponStats } from '../../config/gameConfig'
import { ISLANDS, islandRects } from './arenaMap'
import { angleDiff, circleIntersectsRect, clamp, pushCircleOutOfRect, segmentIntersectsRect, pointInRect } from './collision'
import { FlowField } from './navigation'
import { createRng, type Rng } from './rng'
import type { EndReason, Faction, InputState, MatchStatus, Projectile, Rect, Ship, ShipKind, SimEvent } from './types'

const PROJECTILE_RADIUS = 5

/**
 * Pure game rules: no PixiJS, React or DOM. Advanced only through `step(dt, input)` with a fixed dt,
 * so everything (movement, cooldowns, spawns, timer) is frame-rate independent and freezes on pause.
 */
export class Simulation {
  readonly islands: readonly Rect[]
  readonly player: Ship
  enemies: Ship[] = []
  projectiles: Projectile[] = []
  /** Events produced since the last `drainEvents()`. */
  private events: SimEvent[] = []

  status: MatchStatus = 'running'
  endReason: EndReason | null = null
  score = 0
  /** active play time, seconds */
  elapsed = 0
  spawnCount = 0
  /** Counters for debugging and tests (read-only observation of the rules). */
  readonly stats = { playerShots: 0, enemyShots: 0, playerHits: 0, enemyHits: 0, kills: 0, chaserImpacts: 0 }

  private readonly rng: Rng
  private readonly flow: FlowField
  private nextId = 1
  private spawnTimer: number

  readonly config: Readonly<GameConfig>

  constructor(config: Readonly<GameConfig>, seed: number) {
    this.config = config
    this.rng = createRng(seed)
    this.islands = islandRects(ISLANDS)
    const { width, height } = config.arena
    const clearance = Math.max(config.chaser.radius, config.shooter.radius) + 4
    this.flow = new FlowField(width, height, this.islands, clearance)
    this.player = this.createShip('player', width / 2, height / 2, -Math.PI / 2)
    this.spawnTimer = config.session.spawnIntervalSec
  }

  get timeLeft() {
    return Math.max(0, this.config.session.durationSec - this.elapsed)
  }

  /** Effective played time, seconds. */
  get duration() {
    return Math.min(this.elapsed, this.config.session.durationSec)
  }

  drainEvents(): SimEvent[] {
    const events = this.events
    this.events = []
    return events
  }

  step(dt: number, input: Readonly<InputState>) {
    if (this.status !== 'running') return
    this.elapsed += dt

    this.updatePlayer(dt, input)
    this.updateEnemies(dt)
    this.updateProjectiles(dt)
    this.handleChaserImpacts()
    this.separateShips()
    this.updateSpawns(dt)

    this.enemies = this.enemies.filter((e) => e.alive)
    this.projectiles = this.projectiles.filter((p) => p.alive)

    // A ship sunk in the same step the clock runs out counts as destroyed.
    if (this.player.health <= 0) this.end('destroyed')
    else if (this.elapsed >= this.config.session.durationSec) this.end('time_up')
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number, input: Readonly<InputState>) {
    const p = this.player
    const stats = this.config.player
    const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0)
    p.angle += turn * stats.turnSpeed * dt
    if (input.forward) this.moveForward(p, stats.moveSpeed * dt)

    p.cooldowns.front = Math.max(0, p.cooldowns.front - dt)
    p.cooldowns.side = Math.max(0, p.cooldowns.side - dt)

    if (input.fireFront && p.cooldowns.front <= 0) {
      p.cooldowns.front = stats.front.cooldown
      this.fire(p, 'player', 'front', p.angle, stats.front, p.radius + 12, 0)
    }
    // Both broadsides share one cooldown; pressing both fires both.
    if ((input.fireLeft || input.fireRight) && p.cooldowns.side <= 0) {
      p.cooldowns.side = stats.side.cooldown
      const { count, spacing } = stats.side
      for (const [pressed, sideAngle] of [[input.fireLeft, -Math.PI / 2], [input.fireRight, Math.PI / 2]] as const) {
        if (!pressed) continue
        for (let i = 0; i < count; i++) {
          const along = (i - (count - 1) / 2) * spacing
          this.fire(p, 'player', 'side', p.angle + sideAngle, stats.side, p.radius * 0.6, along)
        }
      }
    }
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number) {
    const p = this.player
    this.flow.update(p.x, p.y)
    for (const e of this.enemies) {
      if (!e.alive) continue
      const stats = e.kind === 'chaser' ? this.config.chaser : this.config.shooter
      const dx = p.x - e.x
      const dy = p.y - e.y
      const dist = Math.hypot(dx, dy)
      const hasLineOfSight = this.lineOfSight(e.x, e.y, p.x, p.y, e.radius * 0.5)

      // Steer straight at the player when visible, otherwise follow the flow field around islands.
      let targetAngle = Math.atan2(dy, dx)
      if (!hasLineOfSight) {
        const wp = this.flow.nextWaypoint(e.x, e.y)
        if (wp) targetAngle = Math.atan2(wp.y - e.y, wp.x - e.x)
      }
      const diff = angleDiff(e.angle, targetAngle)
      e.angle += clamp(diff, -stats.turnSpeed * dt, stats.turnSpeed * dt)

      if (e.kind === 'chaser') {
        // Slow down on sharp turns so chasers do not orbit the player forever.
        const speedFactor = Math.abs(diff) > 1.2 ? 0.5 : 1
        this.moveForward(e, stats.moveSpeed * speedFactor * dt)
        continue
      }

      const shooter = this.config.shooter
      if (!hasLineOfSight || dist > shooter.preferredDistance) this.moveForward(e, stats.moveSpeed * dt)

      e.cooldowns.front = Math.max(0, e.cooldowns.front - dt)
      const aimed = Math.abs(angleDiff(e.angle, Math.atan2(dy, dx))) <= shooter.aimTolerance
      if (hasLineOfSight && dist <= shooter.attackRange && aimed && e.cooldowns.front <= 0) {
        e.cooldowns.front = shooter.weapon.cooldown
        this.fire(e, 'enemy', 'front', e.angle, shooter.weapon, e.radius + 12, 0)
      }
    }
  }

  private handleChaserImpacts() {
    const p = this.player
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'chaser') continue
      if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
        this.stats.chaserImpacts += 1
        this.damagePlayer(this.config.chaser.impactDamage, e.x, e.y)
        this.destroyShip(e, false)
      }
    }
  }

  /** Keeps ships from overlapping each other (no damage, except chaser impacts handled above). */
  private separateShips() {
    const ships = [this.player, ...this.enemies.filter((e) => e.alive)]
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i]!
        const b = ships[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.001
        const overlap = a.radius + b.radius - dist
        if (overlap <= 0) continue
        // The player is heavier: enemies get pushed away from it.
        const share = a.kind === 'player' ? 1 : 0.5
        b.x += (dx / dist) * overlap * share
        b.y += (dy / dist) * overlap * share
        if (share < 1) {
          a.x -= (dx / dist) * overlap * 0.5
          a.y -= (dy / dist) * overlap * 0.5
        }
      }
    }
    for (const s of ships) this.resolveStatic(s)
  }

  // ---------------------------------------------------------------- projectiles

  private fire(ship: Ship, faction: Faction, kind: 'front' | 'side', angle: number, weapon: WeaponStats, forwardOffset: number, alongOffset: number) {
    const hx = Math.cos(ship.angle)
    const hy = Math.sin(ship.angle)
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const x = ship.x + hx * alongOffset + dx * forwardOffset
    const y = ship.y + hy * alongOffset + dy * forwardOffset
    this.projectiles.push({
      id: this.nextId++,
      faction,
      x,
      y,
      vx: dx * weapon.projectileSpeed,
      vy: dy * weapon.projectileSpeed,
      damage: weapon.damage,
      remaining: weapon.range,
      alive: true,
    })
    if (faction === 'player') this.stats.playerShots += 1
    else this.stats.enemyShots += 1
    this.events.push({ type: 'shot', faction, weapon: kind, x, y, angle })
  }

  private updateProjectiles(dt: number) {
    const { width, height } = this.config.arena
    for (const pr of this.projectiles) {
      if (!pr.alive) continue
      pr.x += pr.vx * dt
      pr.y += pr.vy * dt
      pr.remaining -= Math.hypot(pr.vx, pr.vy) * dt

      if (pr.x < 0 || pr.y < 0 || pr.x > width || pr.y > height) {
        pr.alive = false
        continue
      }
      if (this.islands.some((r) => pointInRect(pr.x, pr.y, r))) {
        pr.alive = false
        this.events.push({ type: 'splash', x: pr.x, y: pr.y })
        continue
      }

      const targets = pr.faction === 'player' ? this.enemies : [this.player]
      const target = targets.find((s) => s.alive && Math.hypot(s.x - pr.x, s.y - pr.y) < s.radius + PROJECTILE_RADIUS)
      if (target) {
        // Removed in the same step, so each projectile applies damage exactly once.
        pr.alive = false
        if (pr.faction === 'player') this.stats.playerHits += 1
        else this.stats.enemyHits += 1
        this.events.push({ type: 'hit', targetId: target.id, x: pr.x, y: pr.y })
        if (target.kind === 'player') this.damagePlayer(pr.damage, pr.x, pr.y)
        else {
          target.health = Math.max(0, target.health - pr.damage)
          if (target.health <= 0) this.destroyShip(target, true)
        }
        continue
      }

      if (pr.remaining <= 0) {
        pr.alive = false
        this.events.push({ type: 'splash', x: pr.x, y: pr.y })
      }
    }
  }

  private damagePlayer(amount: number, x: number, y: number) {
    const p = this.player
    if (!p.alive) return
    p.health = Math.max(0, p.health - amount)
    if (p.health <= 0) {
      p.alive = false
      this.events.push({ type: 'shipDestroyed', id: p.id, kind: 'player', x: p.x, y: p.y, angle: p.angle, byPlayer: false })
    } else {
      this.events.push({ type: 'hit', targetId: p.id, x, y })
    }
  }

  private destroyShip(ship: Ship, byPlayer: boolean) {
    if (!ship.alive) return
    ship.alive = false
    ship.health = 0
    if (byPlayer) {
      this.score += 1
      this.stats.kills += 1
    }
    this.events.push({ type: 'shipDestroyed', id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, angle: ship.angle, byPlayer })
  }

  // ---------------------------------------------------------------- spawning

  private updateSpawns(dt: number) {
    this.spawnTimer -= dt
    if (this.spawnTimer > 0) return
    this.spawnTimer += this.config.session.spawnIntervalSec
    if (this.enemies.filter((e) => e.alive).length >= this.config.session.maxEnemies) return

    const kind = this.pickSpawnKind()
    const radius = this.config[kind].radius
    const spot = this.findSpawnPoint(radius)
    if (!spot) return
    const angle = Math.atan2(this.player.y - spot.y, this.player.x - spot.x)
    const ship = this.createShip(kind, spot.x, spot.y, angle)
    this.enemies.push(ship)
    this.spawnCount += 1
    this.events.push({ type: 'spawn', id: ship.id, kind })
  }

  private pickSpawnKind(): Exclude<ShipKind, 'player'> {
    // Guarantee both types show up early in every match, then follow the configured weights.
    if (this.spawnCount === 0) return 'chaser'
    if (this.spawnCount === 1) return 'shooter'
    const { chaser, shooter } = this.config.session.spawnWeights
    return this.rng() * (chaser + shooter) < chaser ? 'chaser' : 'shooter'
  }

  private findSpawnPoint(radius: number): { x: number; y: number } | null {
    const { width, height } = this.config.arena
    const margin = radius + 16
    const minDistance = this.config.session.spawnMinDistance
    let fallback: { x: number; y: number; d: number } | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = margin + this.rng() * (width - margin * 2)
      const y = margin + this.rng() * (height - margin * 2)
      if (this.islands.some((r) => circleIntersectsRect(x, y, radius + 24, r))) continue
      if (this.enemies.some((e) => e.alive && Math.hypot(e.x - x, e.y - y) < e.radius + radius + 8)) continue
      const d = Math.hypot(this.player.x - x, this.player.y - y)
      if (d >= minDistance) return { x, y }
      if (!fallback || d > fallback.d) fallback = { x, y, d }
    }
    // Never spawn on top of the player, even when the arena is crowded.
    return fallback && fallback.d >= minDistance / 2 ? fallback : null
  }

  // ---------------------------------------------------------------- helpers

  private createShip(kind: ShipKind, x: number, y: number, angle: number): Ship {
    const stats = this.config[kind]
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      angle,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      alive: true,
      cooldowns: { front: 0, side: 0 },
    }
  }

  private moveForward(ship: Ship, distance: number) {
    ship.x += Math.cos(ship.angle) * distance
    ship.y += Math.sin(ship.angle) * distance
    this.resolveStatic(ship)
  }

  /** Keeps a ship inside the arena and outside every island. */
  private resolveStatic(ship: Ship) {
    for (const r of this.islands) pushCircleOutOfRect(ship, ship.radius, r)
    ship.x = clamp(ship.x, ship.radius, this.config.arena.width - ship.radius)
    ship.y = clamp(ship.y, ship.radius, this.config.arena.height - ship.radius)
  }

  private lineOfSight(x1: number, y1: number, x2: number, y2: number, pad: number) {
    return !this.islands.some((r) => segmentIntersectsRect(x1, y1, x2, y2, r, pad))
  }

  private end(reason: EndReason) {
    this.status = 'ended'
    this.endReason = reason
    this.events.push({ type: 'matchEnded', reason })
  }
}
