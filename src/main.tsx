import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// Si se publicó una versión nueva mientras la app estaba abierta, algunas partes viejas ya no existen:
// se recarga una vez para tomar la versión nueva.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'pd.reloaded-at'
  const last = Number(sessionStorage.getItem(key) ?? 0)
  if (Date.now() - last > 10_000) {
    event.preventDefault()
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
