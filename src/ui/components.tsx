import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { audio } from '../game/audio/audio'

export function Panel({ children, wide = false, labelledBy }: { children: ReactNode; wide?: boolean; labelledBy?: string }) {
  return (
    <section className={wide ? 'panel panel--wide' : 'panel'} aria-labelledby={labelledBy}>
      {children}
    </section>
  )
}

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' }

export function MenuButton({ variant = 'primary', className = '', type = 'button', onClick, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`menu-button menu-button--${variant} ${className}`}
      onClick={(event) => {
        // A click is a user gesture: the browser lets audio start from here.
        audio.unlock()
        audio.play('uiClick', 0.4)
        onClick?.(event)
      }}
      {...props}
    />
  )
}

/** Sound on/off, persisted. Hidden when audio is disabled (no Web Audio, or tests without ?sound). */
export function SoundToggle() {
  const muted = useSyncExternalStore(audio.subscribe, () => audio.isMuted())
  if (!audio.enabled) return null
  return (
    <button
      type="button"
      className="link-button"
      aria-pressed={!muted}
      onClick={() => {
        audio.unlock()
        audio.setMuted(!muted)
      }}
    >
      Sound: {muted ? 'off' : 'on'}
    </button>
  )
}

export function RoundButton({ icon, label, className = '', type = 'button', ...props }: ComponentProps<'button'> & { icon: string; label: string }) {
  return (
    <button type={type} className={`round-button ${className}`} aria-label={label} title={label} {...props}>
      <img src={`/assets/png/default/ui/controls/icon_${icon}.png`} alt="" draggable={false} />
    </button>
  )
}

const CONTROLS_HELP: readonly [string, string][] = [
  ['W / ↑', 'Sail forward'],
  ['A / ←  ·  D / →', 'Turn left / right'],
  ['Space', 'Bow cannon'],
  ['Q / E', 'Left / right broadside (3 shots)'],
  ['Esc / P', 'Pause'],
]

export function ControlsHelp() {
  return (
    <dl className="controls-help">
      {CONTROLS_HELP.map(([keys, action]) => (
        <div key={keys}>
          <dt>{keys}</dt>
          <dd>{action}</dd>
        </div>
      ))}
      <div>
        <dt>Touch</dt>
        <dd>On-screen buttons (landscape)</dd>
      </div>
    </dl>
  )
}

