import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { flushOutbox } from './funnel/submit'
import './index.css'
import { captureAttribution } from './lib/attribution'
import { initPixel } from './lib/pixel'

// Attribution must be read from the landing URL before the router redirects and drops the query string.
captureAttribution()
if (new URLSearchParams(window.location.search).get('test') === '1') {
  sessionStorage.setItem('leadrelay.is_test', '1')
}
initPixel()
void flushOutbox()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
