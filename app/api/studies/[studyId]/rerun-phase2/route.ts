import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/studies/[studyId]/rerun-phase2
 *
 * Clears the existing phase2_run_id so the clinical analysis can be re-run.
 * Does NOT delete the old run or report — preserves history.
 * Redirects to the Phase 2 landing page where the user can trigger a fresh run.
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

  await supabase
    .from('studies')
    .update({ phase2_run_id: null })
    .eq('id', studyId)

  return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase2`)
}
