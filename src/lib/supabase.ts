import { createClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '../config/app'

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

// Con valores de relleno el cliente se crea igual; la app muestra una pantalla de configuración en su lugar.
export const supabase = createClient(
  SUPABASE_URL || 'https://configura-tu-proyecto.supabase.co',
  SUPABASE_KEY || 'falta-la-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export type Row = Record<string, unknown>
export type Id = string | number
