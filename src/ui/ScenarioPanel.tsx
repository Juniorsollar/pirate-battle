import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { db } from '../mocks/db'
import { getScenario, resetNetworkRandomness, SCENARIOS, setScenario, isScenario, type ScenarioName } from '../mocks/scenarios'

/** Demo/QA control for the mocked ranking & history API. */
export function ScenarioPanel() {
  const queryClient = useQueryClient()
  const [scenario, setLocal] = useState<ScenarioName>(getScenario)
  const [status, setStatus] = useState('')

  const choose = (name: ScenarioName) => {
    setScenario(name)
    setLocal(name)
    setStatus(`Network scenario: ${SCENARIOS[name]}.`)
    void queryClient.invalidateQueries()
  }

  const reset = () => {
    db.reset()
    resetNetworkRandomness()
    setScenario('success')
    setLocal('success')
    queryClient.clear()
    setStatus('Mock API restored to its initial state.')
  }

  return (
    <details className="scenario-panel">
      <summary>Network scenarios (demo)</summary>
      <label htmlFor="scenario">Mock API behaviour</label>
      <select id="scenario" value={scenario} onChange={(e) => isScenario(e.target.value) && choose(e.target.value)}>
        {Object.entries(SCENARIOS).map(([name, label]) => (
          <option key={name} value={name}>
            {label}
          </option>
        ))}
      </select>
      <button type="button" className="link-button" onClick={reset}>
        Reset mock data
      </button>
      <p role="status" className="hint">
        {status}
      </p>
    </details>
  )
}
