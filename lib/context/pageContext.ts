/**
 * Page context system for Ask LumosAI.
 *
 * HOW IT WORKS:
 * 1. Each server page builds a LumosPageContext from the data it fetched.
 * 2. A PageContextDispatcher client component fires a "lumos-page-context"
 *    window event on mount, carrying the context object.
 * 3. StudyChat listens for the event, stores the context in state, and
 *    includes it in every /api/chat request.
 * 4. The chat API injects it into the system prompt so Claude knows exactly
 *    what data is visible on the user's screen.
 *
 * MAINTENANCE RULE (also in CLAUDE.md):
 * - New FIELD in an existing page's data → update the page's context block
 *   in its server page.tsx file (search for "LumosPageContext" in that file).
 * - New PAGE added to the study flow → add a PageContextDispatcher call to
 *   the new page.tsx. TypeScript will warn if pageId is not in the union.
 */

// ── Page IDs ──────────────────────────────────────────────────────────────────
// Extend this union when new pages are added to /app/studies/[studyId]/.
// TypeScript will error on any PageContextDispatcher call that uses an unknown
// pageId — that's the compile-time reminder to add the new page's context.
export type LumosPageId =
  | "phase1/report"
  | "phase1/processing"
  | "phase2/overview"
  | "phase2/patients"
  | "phase2/subtyping"
  | "phase2/report"
  | "phase2/processing"

// ── Context shape ─────────────────────────────────────────────────────────────
// visibleData: flat key → value map of the facts currently on screen.
// Values are strings (including formatted numbers) so Claude reads them
// naturally in the prompt without needing to parse JSON.
export interface LumosPageContext {
  pageId: LumosPageId
  pageLabel: string
  visibleData: Record<string, string | null>
}

// ── Prompt formatter ──────────────────────────────────────────────────────────
// Called by the chat API route to inject context into the system prompt.
export function formatPageContextForPrompt(ctx: LumosPageContext): string {
  const lines: string[] = [
    `CURRENT PAGE: ${ctx.pageLabel}`,
    `What the user sees on this page:`,
  ]
  for (const [key, value] of Object.entries(ctx.visibleData)) {
    if (value !== null && value !== undefined && value !== "") {
      lines.push(`  • ${key}: ${value}`)
    }
  }
  lines.push(
    `When answering, refer to the values above as the current state of the analysis.`,
    `Do not contradict these numbers — they are what is rendered on screen right now.`,
  )
  return lines.join("\n")
}

// ── Helper: format a confidence number as a percentage string ─────────────────
export function pct(value: number | null | undefined): string | null {
  if (value == null) return null
  return `${Math.round(value * 100)}%`
}

// ── Helper: format a count as "N/16" ─────────────────────────────────────────
export function outOf(n: number | null | undefined, total = 16): string | null {
  if (n == null) return null
  return `${n}/${total}`
}
