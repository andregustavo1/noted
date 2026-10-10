import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, process.cwd()).VITE_SUPABASE_URL

  return {
    plugins: [
      react(),
      // TEMP: the phone's toolbar animation samples, printed in the dev server's log.
      {
        name: 'temp-device-log',
        configureServer(server) {
          server.middlewares.use('/__log', (req, res) => {
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', () => { console.log('[DEVICE]', body); res.end('ok') })
          })
        },
      },
      // Start connecting to Supabase while the app loads, so the first request for notes is quicker.
      // Skipped when the URL isn't set, so a build without it still works.
      {
        name: 'preconnect-supabase',
        transformIndexHtml: () =>
          supabaseUrl ? [{ tag: 'link', attrs: { rel: 'preconnect', href: supabaseUrl, crossorigin: '' }, injectTo: 'head' }] : [],
      },
    ],
  }
})
