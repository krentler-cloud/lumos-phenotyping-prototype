import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Can be ignored in Server Components
          }
        },
      },
    }
  )
}

// Service-role client for server-side operations (bypasses RLS)
export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: {
        // Vector search on 13K+ chunks can exceed the default 8s statement timeout.
        // This sets the Postgres statement_timeout for this client's session.
        schema: 'public',
      },
      global: {
        // Increase fetch timeout to 60s for heavy vector searches (346K+ chunks)
        fetch: (url: string, options: RequestInit = {}) => {
          return fetch(url, { ...options, signal: AbortSignal.timeout(60_000) })
        },
      },
    }
  )
}
