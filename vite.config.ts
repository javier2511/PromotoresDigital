import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Versión publicada (se ve en Perfil): el commit que publicó Vercel/Cloudflare y la fecha de compilación.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? '').slice(0, 7)
const compilado = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD__: JSON.stringify(commit ? `${commit} · ${compilado} UTC` : `${compilado} UTC`),
  },
  build: {
    target: 'es2022',
    // MapLibre (mapa) se carga aparte, solo al abrir un mapa.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Librerías en archivos propios: cambian poco, así el teléfono las conserva en caché entre versiones.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'ui', test: /node_modules[\\/](@tanstack|sonner|lucide-react)[\\/]/ },
          ],
        },
      },
    },
  },
})
