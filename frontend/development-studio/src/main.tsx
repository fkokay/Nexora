import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './base.css'
import './studio.css'

const url = new URL(window.location.href)
if (url.searchParams.get('app') !== 'studio') {
  url.searchParams.set('app', 'studio')
  window.history.replaceState(null, '', url)
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
