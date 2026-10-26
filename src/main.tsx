import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { requestPersistence } from './db/db'
import '@xyflow/react/dist/style.css'
import './index.css'

// Просим браузер не вытеснять базу: без этого local-first однажды потеряет данные.
void requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
