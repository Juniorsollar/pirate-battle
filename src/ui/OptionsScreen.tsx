import { useEffect, useRef, useState } from 'react'
import { OPTION_LIMITS, type PlayerOptions } from '../config/gameConfig'
import { saveOptions, validateOption, type OptionKey } from '../config/options'
import { MenuButton, Panel, RoundButton } from './components'

const FIELDS: { key: OptionKey; label: string }[] = [
  { key: 'durationSec', label: 'Game session time' },
  { key: 'spawnIntervalSec', label: 'Enemy spawn time' },
]

export function OptionsScreen({ initial, onSaved, onBack }: { initial: PlayerOptions; onSaved: (options: PlayerOptions) => void; onBack: () => void }) {
  const [values, setValues] = useState<Record<OptionKey, string>>({
    durationSec: String(initial.durationSec),
    spawnIntervalSec: String(initial.spawnIntervalSec),
  })
  const [errors, setErrors] = useState<Partial<Record<OptionKey, string>>>({})
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])

  const change = (key: OptionKey, value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setStatus('')
  }

  const stepBy = (key: OptionKey, direction: 1 | -1) => {
    const { min, max, step } = OPTION_LIMITS[key]
    const current = Number(values[key])
    const base = Number.isFinite(current) ? current : min
    change(key, String(Math.min(max, Math.max(min, base + direction * step))))
  }

  const save = () => {
    const next: Partial<Record<OptionKey, string>> = {}
    for (const { key } of FIELDS) {
      const error = values[key].trim() === '' ? 'Enter a number.' : validateOption(key, Number(values[key]))
      if (error) next[key] = error
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setStatus('')
      return
    }
    const options: PlayerOptions = { durationSec: Number(values.durationSec), spawnIntervalSec: Number(values.spawnIntervalSec) }
    saveOptions(options)
    onSaved(options)
    setStatus('Options saved.')
  }

  return (
    <Panel labelledBy="options-title">
      <h1 id="options-title" className="panel-title" tabIndex={-1} ref={headingRef}>
        Options
      </h1>
      <form
        className="options-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {FIELDS.map(({ key, label }) => {
          const { min, max } = OPTION_LIMITS[key]
          const error = errors[key]
          const hintId = `${key}-hint`
          const errorId = `${key}-error`
          return (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <div className="stepper">
                <RoundButton icon="minus" label={`Decrease ${label.toLowerCase()}`} onClick={() => stepBy(key, -1)} />
                <span className="stepper-value">
                  <input
                    id={key}
                    name={key}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    step={1}
                    value={values[key]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${hintId} ${errorId}` : hintId}
                    onChange={(event) => change(key, event.target.value)}
                  />
                  <span aria-hidden="true">s</span>
                </span>
                <RoundButton icon="plus" label={`Increase ${label.toLowerCase()}`} onClick={() => stepBy(key, 1)} />
              </div>
              <p id={hintId} className="hint">
                {min}–{max} seconds
              </p>
              {error && (
                <p id={errorId} className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )
        })}
        <p className="status" role="status">
          {status}
        </p>
        <div className="stack">
          <MenuButton type="submit">Save</MenuButton>
          <MenuButton variant="secondary" onClick={onBack}>
            Main Menu
          </MenuButton>
        </div>
      </form>
    </Panel>
  )
}
