import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
