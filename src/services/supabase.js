import { createClient } from '@supabase/supabase-js'

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Mancano le credenziali Supabase nel file .env')
}

// Clean URL from rest/v1 suffixes if present to avoid PostgREST PGRST125 error
if (supabaseUrl && supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.slice(0, -9)
} else if (supabaseUrl && supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.slice(0, -8)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
