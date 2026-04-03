import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/studies/[studyId]/rerun-phase1
 *
 * Clears the existing phase1_run_id so the analysis can be re-run
 * against the current corpus, then redirects to the phase1 landing page.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params

  const forwarded = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const explicitBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const publicBase = explicitBase ?? (forwarded ? `${proto}://${forwarded}` : req.nextUrl.origin)

  const supabase = createServiceClient()

  // Unlink the existing run (don't delete — preserves history)
  await supabase
    .from('studies')
    .update({ phase1_run_id: null })
    .eq('id', studyId)

  // phase1/page.tsx will now show the run button instead of redirecting to report
  return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase1`)
}
