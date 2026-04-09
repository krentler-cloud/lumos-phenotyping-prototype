"use client";

import React from "react";

// Shared primitives used by Phase1ReportViewer and Phase2FinalReport.
// Forward rule: any visual primitive used in both reports lives here.

// ── Dimension metadata ────────────────────────────────────────────────────────
export const DIMENSION_META: Record<string, { icon: string; color: string }> = {
  Demographics:    { icon: "👤", color: "var(--text-muted)" },
  "Core Clinical": { icon: "🧠", color: "var(--brand-core)" },
  Inflammatory:    { icon: "🔥", color: "var(--status-danger)" },
  Neuroplasticity: { icon: "⚡", color: "var(--status-purple)" },
  "Imaging / EEG": { icon: "📡", color: "var(--brand-core)" },
};

// ── parseBullets ──────────────────────────────────────────────────────────────
export function parseBullets(value: string): string[] {
  const semis = value.split(/;\s+/).map(s => s.trim().replace(/[.;]+$/, "")).filter(Boolean);
  if (semis.length >= 2) return semis;
  return (value.match(/[^.!?]+[.!?]+/g) ?? [value]).map(s => s.trim()).filter(Boolean);
}

// ── splitSummary ──────────────────────────────────────────────────────────────
export function splitSummary(text: string, leadSentences = 2): { lead: string; rest: string } {
  const matches = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  if (matches.length <= leadSentences) return { lead: text, rest: "" };
  const lead = matches.slice(0, leadSentences).join("").trim();
  const rest = matches.slice(leadSentences).join("").trim();
  return { lead, rest };
}

// ── DimensionBlock ────────────────────────────────────────────────────────────
export function DimensionBlock({ label, value, accentColor }: { label: string; value: string; accentColor?: string }) {
  if (!value) return null;
  const meta = DIMENSION_META[label] ?? { icon: "·", color: "var(--text-muted)" };
  const color = accentColor ?? meta.color;
  const bullets = parseBullets(value);
  return (
    <div className="p-4 bg-bg-page border border-border-subtle rounded-xl flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm leading-none">{meta.icon}</span>
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>{label}</p>
      </div>
      <ul className="space-y-1.5">
        {bullets.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text-body leading-relaxed">
            <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-70" style={{ background: color }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── renderWithBold ────────────────────────────────────────────────────────────
// Parses **text** patterns and renders them as <strong>. All other text is plain.
// Used by DimensionProse to let Opus emphasize key threshold values inline.
function renderWithBold(text: string): React.ReactNode[] {
  return text.split(/\*\*([^*]+)\*\*/g).map((chunk, i) =>
    i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk
  );
}

// ── DimensionProse (Phase 2) ──────────────────────────────────────────────────
// Renders dimension content as prose paragraph (not bulleted) — for Phase 2
// where Opus is instructed to write analytical prose, not semicolon lists.
// Supports **bold** for key threshold values (e.g. "BDNF was **18.3 ng/mL**").
export function DimensionProse({ label, value, accentColor }: { label: string; value: string; accentColor?: string }) {
  if (!value) return null;
  const meta = DIMENSION_META[label] ?? { icon: "·", color: "var(--text-muted)" };
  const color = accentColor ?? meta.color;
  return (
    <div className="p-4 bg-bg-page border border-border-subtle rounded-xl flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm leading-none">{meta.icon}</span>
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>{label}</p>
      </div>
      <p className="text-xs text-text-body leading-relaxed">{renderWithBold(value)}</p>
    </div>
  );
}

// ── ConfidenceBadge (Phase 1) ─────────────────────────────────────────────────
export function ConfidenceBadge({
  value,
  onClick,
  active,
}: {
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "var(--status-success)" : pct >= 45 ? "var(--status-warning)" : "var(--status-danger)";
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold px-2.5 py-1 rounded-full border transition-all"
      style={{
        color,
        borderColor: color,
        background: active ? `${color}30` : `${color}18`,
        cursor: onClick ? "pointer" : "default",
      }}
      title={onClick ? "Click to ask LumosAI about this score" : undefined}
    >
      {pct}% confidence {onClick && "ⓘ"}
    </button>
  );
}

// ── PosteriorBadge (Phase 2) ──────────────────────────────────────────────────
// Shows Bayesian posterior after observing clinical data. Prior only on hover (when no onClick).
// When onClick is provided, renders as a button — clicking asks LumosAI.
// No arrow, no "VALIDATED" text, no subtracted delta.
export function PosteriorBadge({
  posterior,
  prior,
  onClick,
}: {
  posterior: number;
  prior: number;
  onClick?: () => void;
}) {
  const postPct = Math.round(posterior * 100);
  const priorPct = Math.round(prior * 100);
  const color = postPct >= 70 ? "var(--status-success)" : postPct >= 45 ? "var(--status-warning)" : "var(--status-danger)";
  const badgeClasses = "text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap";
  const badgeStyle = { color, borderColor: color, background: `${color}18` };

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${badgeClasses} cursor-pointer hover:opacity-80 transition-opacity`}
        style={badgeStyle}
      >
        Posterior {postPct}% ⓘ
      </button>
    );
  }

  const tooltip = `Bayesian posterior after observing N=16 clinical outcomes. Corpus prior: ${priorPct}%. The posterior and prior measure different things (observed-outcome likelihood vs. corpus evidence strength) and are not directly comparable as a delta.`;
  return (
    <span
      className={`${badgeClasses} cursor-help`}
      style={badgeStyle}
      title={tooltip}
    >
      Posterior {postPct}% ⓘ
    </span>
  );
}
