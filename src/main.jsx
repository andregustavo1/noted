import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Roboto Mono is bundled with the app (no request to Google Fonts on every open).
import '@fontsource-variable/roboto-mono'
import '@fontsource-variable/roboto-mono/wght-italic.css'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Keeps the app's files on the device so it opens without waiting on the network (see public/sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.error(error))
  })
}
