import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/queries'
import { App } from './app/App'
import { startMockApi } from './mocks/browser'
import { applyScenarioFromUrl } from './mocks/scenarios'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/700.css'
import '@fontsource/roboto/900.css'
import './index.css'

const queryClient = createQueryClient()

async function bootstrap() {
  applyScenarioFromUrl()
  try {
    await startMockApi()
  } catch (error) {
    // The game must stay playable even if the mock API cannot start.
    console.warn('Mock API unavailable', error)
  }

  const root = document.getElementById('root')
  if (!root) throw new Error('Root element not found')

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
