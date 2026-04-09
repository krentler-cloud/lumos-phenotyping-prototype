"use client";

/**
 * PageContextDispatcher
 *
 * Invisible client component. Server pages render this with the context they
 * built from their fetched data. On mount it fires a "lumos-page-context"
 * window event that StudyChat picks up and includes in every chat request.
 *
 * Usage in a server page.tsx:
 *
 *   import { PageContextDispatcher } from "@/components/PageContextDispatcher";
 *
 *   // inside the JSX:
 *   <PageContextDispatcher context={{
 *     pageId: "phase2/report",
 *     pageLabel: "Clinical Analysis Final Report",
 *     visibleData: { ... }
 *   }} />
 *
 * MAINTENANCE: When you add a new page to /app/studies/[studyId]/, add a new
 * PageContextDispatcher call in that page.tsx. TypeScript will error if the
 * pageId is not in the LumosPageId union — add it there first.
 */

import { useEffect } from "react";
import type { LumosPageContext } from "@/lib/context/pageContext";

export function PageContextDispatcher({ context }: { context: LumosPageContext }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lumos-page-context", { detail: context })
    );
    // Re-dispatch if context values change (e.g. after a re-run lands)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context)]);

  return null;
}
