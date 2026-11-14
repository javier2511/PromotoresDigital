#!/usr/bin/env bash
# Pruebas en el navegador con el simulador de Supabase (no toca tu base real).
# Compila la app apuntando al simulador, la sirve en el puerto 4173 y corre las pruebas.
# Uso: bash e2e/correr.sh [carpeta de capturas]
set -euo pipefail
cd "$(dirname "$0")/.."

VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=mock-anon-key VITE_MAP_STYLE_URL=https://mock-style.local/style.json \
  node node_modules/vite/bin/vite.js build --outDir dist-e2e --emptyOutDir > /dev/null

node node_modules/vite/bin/vite.js preview --outDir dist-e2e --port 4173 --strictPort > /dev/null 2>&1 &
SERVIDOR=$!
trap 'kill "$SERVIDOR" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -s -o /dev/null http://localhost:4173 && break
  sleep 0.5
done

node e2e/mapa.cjs "${1:-e2e/capturas}"
