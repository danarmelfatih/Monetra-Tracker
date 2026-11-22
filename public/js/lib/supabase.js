import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js'

let client

export function getSb() {
  if (!client) {
    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      { auth: { flowType: 'pkce' } }
    )
  }
  return client
}
