import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import './erp-redesign.css'
import './dynamics-workbench.css'
import './screen-title.css'
import './global-components.css'
import './module-workspace.css'
import './form-design-system.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
