import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Como los teléfonos de los promotores (algunas columnas guardan la hora local sin zona).
    env: { TZ: 'America/Mexico_City' },
  },
})
