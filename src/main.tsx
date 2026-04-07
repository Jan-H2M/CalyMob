import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import App from './App.tsx'
import './index.css'

// Disable service workers in development/webview to prevent registration errors
import './utils/disableServiceWorkers'

Sentry.init({
  dsn: "https://dfe6d014ba81b41a11cda2e49b0b5f5e@o4511155451527168.ingest.de.sentry.io/4511155481477200",
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
})

posthog.init("phc_8veREUVYFSN2QehwOv8FIyQyVBMyMgvcER7LxT6gDGn", {
  api_host: "https://eu.i.posthog.com",
  person_profiles: "identified_only",
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error occurred</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)