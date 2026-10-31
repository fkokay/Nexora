import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './base.css'
import './studio.css'
import './studio-analytics.css'

// A deployment can replace fingerprinted chunks while an older Studio tab is
// still open. Recover once from Vite's failed lazy-import event by loading the
// current app shell; the session guard prevents reload loops if the network is
// still serving a stale version.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'studio-vite-preload-reload-at'
  const now = Date.now()
  const lastReloadAt = Number(window.sessionStorage.getItem(key) ?? 0)
  if (now - lastReloadAt < 30_000) return
  window.sessionStorage.setItem(key, String(now))
  window.location.reload()
})

const url = new URL(window.location.href)
if (url.searchParams.get('app') !== 'studio') {
  url.searchParams.set('app', 'studio')
  window.history.replaceState(null, '', url)
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
