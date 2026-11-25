import { Container, Rectangle, Sprite, Texture, TilingSprite, type Application } from 'pixi.js'
import { ISLANDS, ISLAND_SHAPES, TILE } from '../sim/arenaMap'
import type { Simulation } from '../sim/Simulation'
import type { Ship, ShipKind, SimEvent } from '../sim/types'
import type { GameTextures } from '../assets/gameAssets'

/** Ship colors in the atlas: ship_N (intact), N+6 (damaged), N+12 (heavy), N+18 (wreck). */
const SHIP_COLOR: Record<ShipKind, number> = { player: 5, chaser: 3, shooter: 2 }
const SHIP_SCALE = 0.75
const BAR_SCALE = 0.5
const BAR_OFFSET_Y = 62

interface ShipView {
  root: Container
  hull: Sprite
  fire: Sprite
  bar: Container
  fill: Sprite
  fillWidth: number
  flash: number
  stage: number
}

interface Effect {
  sprite: Sprite
  age: number
  life: number
  update(effect: Effect, t: number): void
}

/** Draws the simulation state with PixiJS. Reads the simulation, never changes it. */
export class GameRenderer {
  readonly world = new Container()
  /** Sea behind the whole canvas, so screens wider or taller than 16:9 show water instead of bars. */
  private readonly sea: TilingSprite
  private readonly shipLayer = new Container()
  private readonly projectileLayer = new Container()
  private readonly fxLayer = new Container()
  private readonly barLayer = new Container()
  private readonly ships = new Map<number, ShipView>()
  private readonly projectiles = new Map<number, Sprite>()
  private readonly projectilePool: Sprite[] = []
  private effects: Effect[] = []

  private readonly app: Application
  private readonly textures: GameTextures
  private readonly sim: Simulation

  constructor(app: Application, textures: GameTextures, sim: Simulation) {
    this.app = app
    this.textures = textures
    this.sim = sim
    this.sea = new TilingSprite({ texture: textures.water, width: 1, height: 1 })
    this.world.addChild(this.buildIslands(), this.shipLayer, this.projectileLayer, this.fxLayer, this.barLayer)
    app.stage.addChild(this.sea, this.world)
    this.fit()
  }

  private frame(name: string) {
    const texture = this.textures.ships.textures[name]
    if (!texture) throw new Error(`Missing texture ${name}`)
    return texture
  }

  private buildIslands() {
    const layer = new Container()
    for (const island of ISLANDS) {
      const shape = ISLAND_SHAPES[island.kind]
      for (let r = 0; r < shape.size; r++) {
        for (let c = 0; c < shape.size; c++) {
          const tile = new Sprite(this.textures.tile(shape.sheetCol + c, shape.sheetRow + r))
          tile.position.set((island.col + c) * TILE, (island.row + r) * TILE)
          layer.addChild(tile)
        }
      }
      // Decoration: palm on grass islands, rock on sand islands.
      const deco = new Sprite(island.kind === 'grass' ? this.textures.tile(6, 4) : this.textures.tile(1, 3))
      deco.anchor.set(0.5)
      deco.position.set((island.col + shape.size / 2) * TILE, (island.row + shape.size / 2) * TILE)
      layer.addChild(deco)
    }
    return layer
  }

  /** Letterboxes the fixed-size arena into the canvas, preserving aspect ratio. */
  fit() {
    const { width, height } = this.sim.config.arena
    const screen = this.app.screen
    const scale = Math.min(screen.width / width, screen.height / height)
    this.world.scale.set(scale)
    this.world.position.set((screen.width - width * scale) / 2, (screen.height - height * scale) / 2)
    // Purely visual: the arena limits stay the same; the tiles line up with the arena grid.
    this.sea.width = screen.width
    this.sea.height = screen.height
    this.sea.tileScale.set(scale)
    this.sea.tilePosition.set(this.world.x, this.world.y)
  }

  private createShipView(ship: Ship): ShipView {
    const root = new Container()
    const hull = new Sprite(this.frame(`ship_${SHIP_COLOR[ship.kind]}`))
    hull.anchor.set(0.5)
    hull.scale.set(SHIP_SCALE)
    const fire = new Sprite(this.frame('fire_1'))
    fire.anchor.set(0.5, 0.9)
    fire.visible = false
    root.addChild(hull, fire)
    this.shipLayer.addChild(root)

    const ui = this.textures.ui.textures
    const frameTexture = ui.enemy_health_frame!
    const fillSource = ui[ship.kind === 'player' ? 'enemy_health_fill_green' : 'enemy_health_fill_red']!
    // fill_rect from the UI atlas metadata (logical units): the coloured part inside the frame.
    const fillRect = { x: 24, y: 12, w: 112, h: 15 }
    const fillTexture = new Texture({
      source: fillSource.source,
      frame: new Rectangle(fillSource.frame.x + fillRect.x, fillSource.frame.y + fillRect.y, fillRect.w, fillRect.h),
    })
    const bar = new Container()
    const frame = new Sprite(frameTexture)
    const fill = new Sprite(fillTexture)
    fill.position.set(fillRect.x, fillRect.y)
    bar.addChild(frame, fill)
    bar.pivot.set(frameTexture.width / 2, frameTexture.height / 2)
    bar.scale.set(BAR_SCALE)
    this.barLayer.addChild(bar)

    const view: ShipView = { root, hull, fire, bar, fill, fillWidth: fillRect.w, flash: 0, stage: 0 }
    this.ships.set(ship.id, view)
    return view
  }

  private removeShipView(id: number) {
    const view = this.ships.get(id)
    if (!view) return
    view.root.destroy({ children: true })
    view.fill.texture.destroy()
    view.bar.destroy({ children: true })
    this.ships.delete(id)
  }

  /** Syncs sprites with the current simulation state; called every rendered frame. */
  sync() {
    const sim = this.sim
    const ships = sim.player.alive ? [sim.player, ...sim.enemies] : sim.enemies
    const seen = new Set<number>()
    const stages = sim.config.damageStages
    for (const ship of ships) {
      if (!ship.alive) continue
      seen.add(ship.id)
      const view = this.ships.get(ship.id) ?? this.createShipView(ship)
      view.root.position.set(ship.x, ship.y)
      // Ship sprites face down (+y); the simulation heading 0 points right.
      view.root.rotation = ship.angle - Math.PI / 2

      const ratio = ship.health / ship.maxHealth
      const stage = ratio > stages.damaged ? 0 : ratio > stages.heavy ? 1 : 2
      if (stage !== view.stage) {
        view.stage = stage
        view.hull.texture = this.frame(`ship_${SHIP_COLOR[ship.kind] + stage * 6}`)
      }
      view.fire.visible = stage > 0
      view.fire.scale.set(stage === 2 ? 1.2 : 0.8)
      view.hull.tint = view.flash > 0 ? 0xff7766 : 0xffffff

      view.bar.position.set(ship.x, ship.y - BAR_OFFSET_Y)
      view.fill.width = view.fillWidth * Math.max(0, ratio)
    }
    for (const id of [...this.ships.keys()]) if (!seen.has(id)) this.removeShipView(id)

    const seenProjectiles = new Set<number>()
    for (const p of sim.projectiles) {
      seenProjectiles.add(p.id)
      let sprite = this.projectiles.get(p.id)
      if (!sprite) {
        sprite = this.projectilePool.pop() ?? new Sprite(this.frame('cannon_ball'))
        sprite.anchor.set(0.5)
        sprite.visible = true
        this.projectileLayer.addChild(sprite)
        this.projectiles.set(p.id, sprite)
      }
      sprite.position.set(p.x, p.y)
    }
    for (const [id, sprite] of this.projectiles) {
      if (seenProjectiles.has(id)) continue
      sprite.visible = false
      this.projectileLayer.removeChild(sprite)
      this.projectilePool.push(sprite)
      this.projectiles.delete(id)
    }
  }

  handleEvents(events: readonly SimEvent[]) {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          this.addEffect('explosion_3', event.x, event.y, 0.15, (e, t) => {
            e.sprite.scale.set(0.35 + t * 0.2)
            e.sprite.alpha = 1 - t
          })
          break
        case 'hit': {
          const view = this.ships.get(event.targetId)
          if (view) view.flash = 0.12
          this.addEffect('explosion_2', event.x, event.y, 0.25, (e, t) => {
            e.sprite.scale.set(0.3 + t * 0.3)
            e.sprite.alpha = 1 - t
          })
          break
        }
        case 'splash':
          this.addEffect('explosion_3', event.x, event.y, 0.3, (e, t) => {
            e.sprite.tint = 0xcfefff
            e.sprite.scale.set(0.2 + t * 0.4)
            e.sprite.alpha = 0.7 * (1 - t)
          })
          break
        case 'shipDestroyed':
          this.addWreck(event.kind, event.x, event.y, event.angle)
          this.addEffect('explosion_1', event.x, event.y, 0.6, (e, t) => {
            e.sprite.texture = this.frame(t < 0.33 ? 'explosion_3' : t < 0.66 ? 'explosion_2' : 'explosion_1')
            e.sprite.scale.set(0.8 + t * 0.9)
            e.sprite.alpha = 1 - t * t
          })
          break
        default:
          break
      }
    }
  }

  private addWreck(kind: ShipKind, x: number, y: number, angle: number) {
    const effect = this.addEffect(`ship_${SHIP_COLOR[kind] + 18}`, x, y, 1.6, (e, t) => {
      e.sprite.alpha = 1 - t
      e.sprite.scale.set(SHIP_SCALE * (1 - t * 0.35))
    })
    effect.sprite.rotation = angle - Math.PI / 2
    // Wrecks sink below the explosions.
    this.fxLayer.setChildIndex(effect.sprite, 0)
  }

  private addEffect(texture: string, x: number, y: number, life: number, update: Effect['update']): Effect {
    const sprite = new Sprite(this.frame(texture))
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    this.fxLayer.addChild(sprite)
    const effect: Effect = { sprite, age: 0, life, update }
    update(effect, 0)
    this.effects.push(effect)
    return effect
  }

  /** Advances visual-only animations. Not called while paused. */
  updateEffects(dt: number) {
    for (const view of this.ships.values()) view.flash = Math.max(0, view.flash - dt)
    for (const effect of this.effects) {
      effect.age += dt
      effect.update(effect, Math.min(1, effect.age / effect.life))
    }
    const done = this.effects.filter((e) => e.age >= e.life)
    if (done.length === 0) return
    for (const effect of done) effect.sprite.destroy()
    this.effects = this.effects.filter((e) => e.age < e.life)
  }

  /** Counts for profiling (?perf). */
  stats() {
    const count = (node: Container): number => node.children.reduce((n, child) => n + count(child), 1)
    return { effects: this.effects.length, displayObjects: count(this.app.stage) }
  }

  destroy() {
    for (const id of [...this.ships.keys()]) this.removeShipView(id)
    for (const sprite of this.projectilePool) sprite.destroy()
    this.projectilePool.length = 0
    this.projectiles.clear()
    this.effects = []
    // Shared atlas textures stay in the Assets cache for the next match.
    this.world.destroy({ children: true })
    this.sea.destroy()
  }
}
