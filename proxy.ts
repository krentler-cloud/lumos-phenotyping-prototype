import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/auth']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always let Next.js internals and public paths through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  // ── Password gate (only active when PROTO_PASSWORD is set) ──────────────────
  // On Railway: gates access behind a shared password for prototype review.
  // Locally: PROTO_PASSWORD is unset so this is skipped entirely.
  const protoPassword = process.env.PROTO_PASSWORD
  if (protoPassword) {
    const authCookie = req.cookies.get('lumos-auth')?.value
    if (authCookie !== protoPassword) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    // Password correct — allow through without Supabase auth check
    return NextResponse.next()
  }

  // ── Supabase auth (local dev fallback when no PROTO_PASSWORD) ───────────────
  const { createServerClient } = await import('@supabase/ssr')
  let res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/auth'
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
