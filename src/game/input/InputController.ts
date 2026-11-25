import { EMPTY_INPUT, type InputState } from '../sim/types'

export type Control = keyof InputState

/** event.code -> control (independent of keyboard layout). */
export const KEY_BINDINGS: Readonly<Record<string, Control>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
}

export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP']

/**
 * Collects keyboard and touch state into one snapshot read by the simulation every step.
 * Listeners exist only while gameplay is active (attach/detach), so menus never lose keys.
 */
export class InputController {
  private readonly keys = new Set<Control>()
  private readonly touch = new Set<Control>()
  private attached = false

  private readonly onPause: () => void

  constructor(onPause: () => void) {
    this.onPause = onPause
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault()
      if (!event.repeat) this.onPause()
      return
    }
    const control = KEY_BINDINGS[event.code]
    if (!control) return
    event.preventDefault()
    this.keys.add(control)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const control = KEY_BINDINGS[event.code]
    if (control) this.keys.delete(control)
  }

  attach() {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  detach() {
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.clear()
  }

  setTouch(control: Control, pressed: boolean) {
    if (!this.attached) return
    if (pressed) this.touch.add(control)
    else this.touch.delete(control)
  }

  /** Drops held keys/touches, e.g. on pause, so nothing "sticks" after resuming. */
  clear() {
    this.keys.clear()
    this.touch.clear()
  }

  read(): InputState {
    if (!this.attached) return EMPTY_INPUT
    const held = (c: Control) => this.keys.has(c) || this.touch.has(c)
    return {
      forward: held('forward'),
      turnLeft: held('turnLeft'),
      turnRight: held('turnRight'),
      fireFront: held('fireFront'),
      fireLeft: held('fireLeft'),
      fireRight: held('fireRight'),
    }
  }
}
