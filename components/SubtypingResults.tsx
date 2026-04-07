"use client";

import Link from "next/link";
import { Phase2ReportData } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult, MadrsTrajectory } from "@/lib/pipeline/clinical-ml";

interface Patient {
  patient_code: string;
  subtype_label: string;
  baseline_bdnf_ng_ml: number;
  baseline_il6_pg_ml: number;
  baseline_crp_mg_l: number;
  baseline_madrs: number;
  wk8_madrs: number | null;
  response_status: string;
}

interface FullReport extends Phase2ReportData {
  ml_result: Phase2MLResult;
  patients: Patient[];
}

const SUBTYPE_COLORS: Record<string, string> = {
  A: "var(--status-success)",
  B: "var(--status-danger)",
  C: "var(--status-warning)",
};

const SUBTYPE_LABELS: Record<string, string> = {
  A: "Subtype A — TrkB-Deficit",
  B: "Subtype B — High-Inflammatory",
  C: "Subtype C — Mixed",
};

// ── SVG Scatter Plot (BDNF vs IL-6) ─────────────────────────────────────────
function ScatterPlot({ patients }: { patients: Patient[] }) {
  const W = 420, H = 280;
  const PAD = { top: 20, right: 20, bottom: 48, left: 52 };

  const bdnfMin = 6, bdnfMax = 26;
  const il6Min = 0, il6Max = 9;

  function scaleX(v: number) {
    return PAD.left + ((v - bdnfMin) / (bdnfMax - bdnfMin)) * (W - PAD.left - PAD.right);
  }
  function scaleY(v: number) {
    // IL-6 increases downward in SVG, so invert
    return PAD.top + ((il6Max - v) / (il6Max - il6Min)) * (H - PAD.top - PAD.bottom);
  }

  // Threshold lines from Phase 1 corpus hypothesis
  const bdnfThreshX = scaleX(15);
  const il6ThreshY = scaleY(4);

  const xTicks = [8, 12, 16, 20, 24];
  const yTicks = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: "monospace" }}>
      {/* Background */}
      <rect width={W} height={H} fill="var(--bg-overlay)" rx="8" />

      {/* Quadrant shading */}
      {/* Bottom-left: Subtype A zone (low BDNF, low IL-6) */}
      <rect
        x={PAD.left} y={il6ThreshY}
        width={bdnfThreshX - PAD.left}
        height={H - PAD.bottom - il6ThreshY}
        fill="var(--status-success)" opacity="0.05"
      />
      {/* Top-right: Subtype B zone (high IL-6) */}
      <rect
        x={PAD.left} y={PAD.top}
        width={W - PAD.left - PAD.right}
        height={il6ThreshY - PAD.top}
        fill="var(--status-danger)" opacity="0.05"
      />

      {/* Grid lines */}
      {xTicks.map(v => (
        <line key={v}
          x1={scaleX(v)} y1={PAD.top}
          x2={scaleX(v)} y2={H - PAD.bottom}
          stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="3,3"
        />
      ))}
      {yTicks.map(v => (
        <line key={v}
          x1={PAD.left} y1={scaleY(v)}
          x2={W - PAD.right} y2={scaleY(v)}
          stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="3,3"
        />
      ))}

      {/* Threshold lines */}
      <line
        x1={bdnfThreshX} y1={PAD.top}
        x2={bdnfThreshX} y2={H - PAD.bottom}
        stroke="var(--status-success)" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
      />
      <line
        x1={PAD.left} y1={il6ThreshY}
        x2={W - PAD.right} y2={il6ThreshY}
        stroke="var(--status-danger)" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
      />

      {/* Threshold labels */}
      <text x={bdnfThreshX + 2} y={PAD.top + 10} fill="var(--status-success)" fontSize="7" opacity="0.7">
        BDNF=15
      </text>
      <text x={PAD.left + 2} y={il6ThreshY - 3} fill="var(--status-danger)" fontSize="7" opacity="0.7">
        IL-6=4
      </text>

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--border-subtle)" strokeWidth="1" />
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--border-subtle)" strokeWidth="1" />

      {/* Axis ticks + labels */}
      {xTicks.map(v => (
        <g key={v}>
          <line x1={scaleX(v)} y1={H - PAD.bottom} x2={scaleX(v)} y2={H - PAD.bottom + 3} stroke="var(--text-secondary)" strokeWidth="1" />
          <text x={scaleX(v)} y={H - PAD.bottom + 12} fill="var(--text-secondary)" fontSize="8" textAnchor="middle">{v}</text>
        </g>
      ))}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left - 3} y1={scaleY(v)} x2={PAD.left} y2={scaleY(v)} stroke="var(--text-secondary)" strokeWidth="1" />
          <text x={PAD.left - 5} y={scaleY(v) + 3} fill="var(--text-secondary)" fontSize="8" textAnchor="end">{v}</text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
        Baseline BDNF (ng/mL)
      </text>
      <text
        x={11} y={(PAD.top + H - PAD.bottom) / 2}
        fill="var(--text-muted)" fontSize="9" textAnchor="middle"
        transform={`rotate(-90, 11, ${(PAD.top + H - PAD.bottom) / 2})`}
      >
        Baseline IL-6 (pg/mL)
      </text>

      {/* Data points */}
      {patients.map(p => {
        const color = SUBTYPE_COLORS[p.subtype_label] ?? "var(--text-muted)";
        const cx = scaleX(p.baseline_bdnf_ng_ml);
        const cy = scaleY(p.baseline_il6_pg_ml);
        return (
          <g key={p.patient_code}>
            <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.85} />
            <circle cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG MADRS Trajectory Line Chart ──────────────────────────────────────────
function MadrsChart({ trajectories }: { trajectories: MadrsTrajectory[] }) {
  const W = 420, H = 240;
  const PAD = { top: 20, right: 80, bottom: 44, left: 44 };

  const timepoints = [0, 2, 4, 8];
  const xPositions = [PAD.left, PAD.left + (W - PAD.left - PAD.right) / 3, PAD.left + 2 * (W - PAD.left - PAD.right) / 3, W - PAD.right];

  const allVals = trajectories.flatMap(t => [t.wk0, t.wk2, t.wk4, t.wk8]);
  const vMin = Math.floor(Math.min(...allVals) - 2);
  const vMax = Math.ceil(Math.max(...allVals) + 2);

  function scaleY(v: number) {
    return PAD.top + ((vMax - v) / (vMax - vMin)) * (H - PAD.top - PAD.bottom);
  }

  const yTicks = [10, 15, 20, 25, 30, 35, 40].filter(v => v >= vMin && v <= vMax);

  const shown = trajectories.filter(t => t.subtype !== 'Overall');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: "monospace" }}>
      <rect width={W} height={H} fill="var(--bg-overlay)" rx="8" />

      {/* Grid */}
      {yTicks.map(v => (
        <line key={v}
          x1={PAD.left} y1={scaleY(v)}
          x2={W - PAD.right} y2={scaleY(v)}
          stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="3,3"
        />
      ))}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--border-subtle)" />
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--border-subtle)" />

      {/* X labels */}
      {timepoints.map((wk, i) => (
        <text key={wk} x={xPositions[i]} y={H - PAD.bottom + 14} fill="var(--text-secondary)" fontSize="9" textAnchor="middle">
          {wk === 0 ? "Baseline" : `Wk ${wk}`}
        </text>
      ))}

      {/* Y labels */}
      {yTicks.map(v => (
        <text key={v} x={PAD.left - 5} y={scaleY(v) + 3} fill="var(--text-secondary)" fontSize="8" textAnchor="end">{v}</text>
      ))}

      {/* Axis labels */}
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
        Timepoint
      </text>
      <text
        x={10} y={(PAD.top + H - PAD.bottom) / 2}
        fill="var(--text-muted)" fontSize="9" textAnchor="middle"
        transform={`rotate(-90, 10, ${(PAD.top + H - PAD.bottom) / 2})`}
      >
        Mean MADRS
      </text>

      {/* Lines */}
      {shown.map(t => {
        const pts = [t.wk0, t.wk2, t.wk4, t.wk8].map((v, i) => `${xPositions[i]},${scaleY(v)}`).join(" ");
        return (
          <g key={t.subtype}>
            <polyline points={pts} fill="none" stroke={t.color} strokeWidth="2" strokeLinejoin="round" />
            {[t.wk0, t.wk2, t.wk4, t.wk8].map((v, i) => (
              <circle key={i} cx={xPositions[i]} cy={scaleY(v)} r={3.5} fill={t.color} />
            ))}
            {/* End label */}
            <text
              x={xPositions[3] + 5}
              y={scaleY(t.wk8) + 4}
              fill={t.color} fontSize="8"
            >
              {t.subtype} ({t.n === 0 ? "—" : t.wk8.toFixed(0)})
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SubtypingResults({
  studyId,
  drugName,
  report,
}: {
  studyId: string;
  drugName: string;
  report: FullReport;
}) {
  const ml = report.ml_result;
  const bu = ml.bayesian_update;

  const subtypeGroups: Record<string, Patient[]> = { A: [], B: [], C: [] };
  for (const p of report.patients) {
    (subtypeGroups[p.subtype_label] ?? subtypeGroups["C"]).push(p);
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-status-purple text-xs uppercase tracking-widest font-semibold mb-1">
            Clinical Analysis · Lumos v2.1
          </p>
          <h1 className="text-2xl font-bold text-text-heading mb-1">2.2 Subtyping Results</h1>
          <p className="text-text-muted text-sm">
            {/* SCIENCE-FEEDBACK: P1-A */}
            {drugName} · N=16 patients · {ml.concordance_pct}% concordance with Planning Phase prediction
          </p>
        </div>
        <Link
          href={`/studies/${studyId}/phase2/report`}
          className="flex-shrink-0 px-4 py-2 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover transition-colors"
        >
          Final Report →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "Responders", value: ml.responder_count, color: "var(--status-success)" },
          { label: "Non-Responders", value: ml.nonresponder_count, color: "var(--status-danger)" },
          { label: "Uncertain", value: ml.uncertain_count, color: "var(--status-warning)" },
          { label: "Concordance", value: `${ml.concordance_pct}%`, color: "var(--brand-core)" },
        ].map(card => (
          <div key={card.label} className="p-4 bg-bg-surface border border-border-subtle rounded-xl text-center">
            <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">{card.label}</p>
            <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-bg-overlay border border-border-subtle rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">
            Patient Scatter — BDNF vs IL-6
          </p>
          <ScatterPlot patients={report.patients} />
          {/* Legend */}
          <div className="flex gap-4 mt-3 justify-center flex-wrap">
            {Object.entries(SUBTYPE_LABELS).map(([k, label]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: SUBTYPE_COLORS[k] }} />
                <span className="text-[10px] text-text-muted">{label.split(" — ")[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-overlay border border-border-subtle rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">
            MADRS Trajectory by Subtype
          </p>
          <MadrsChart trajectories={ml.madrs_trajectories} />
          <div className="flex gap-4 mt-3 justify-center flex-wrap">
            {ml.madrs_trajectories.filter(t => t.subtype !== 'Overall').map(t => (
              <div key={t.subtype} className="flex items-center gap-1.5">
                <div className="w-6 h-0.5" style={{ background: t.color }} />
                <span className="text-[10px] text-text-muted">{SUBTYPE_LABELS[t.subtype]?.split(" — ")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bayesian update */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">Bayesian Confidence Update</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Overall Analysis", prior: bu.overall.prior, posterior: bu.overall.posterior, color: "var(--brand-core)" },
            { label: "Responder Hypothesis", prior: bu.responder.prior, posterior: bu.responder.posterior, color: "var(--status-success)" },
            { label: "Non-Responder Hypothesis", prior: bu.nonresponder.prior, posterior: bu.nonresponder.posterior, color: "var(--status-danger)" },
          ].map(card => {
            const priorPct = Math.round(card.prior * 100);
            const postPct = Math.round(card.posterior * 100);
            const delta = postPct - priorPct;
            return (
              <div key={card.label} className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: card.color }}>{card.label}</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-text-secondary text-sm line-through">{priorPct}%</span>
                  <span className="text-xl font-bold text-text-heading">{postPct}%</span>
                  <span className="text-xs font-semibold" style={{ color: delta >= 0 ? "var(--status-success)" : "var(--status-danger)" }}>
                    {delta >= 0 ? "+" : ""}{delta}pp
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-1 bg-nav-item-active-bg rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-nav-item-active-bg" style={{ width: `${priorPct}%`, opacity: 0.4 }} />
                  </div>
                  <div className="h-1 bg-nav-item-active-bg rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${postPct}%`, background: card.color }} />
                  </div>
                </div>
                <p className="text-[10px] text-text-secondary mt-1">Planning Phase → Clinical</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature importance */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">Predictive Feature Importance</p>
        <div className="bg-bg-overlay border border-border-subtle rounded-xl p-5 space-y-3">
          {ml.feature_importance.slice(0, 7).map((f, i) => {
            const barColor = f.direction === "positive" ? "var(--status-success)" : "var(--status-danger)";
            return (
              <div key={f.feature} className="flex items-center gap-3">
                <span className="text-text-secondary text-xs w-4 text-right">{i + 1}</span>
                <span className="text-text-body text-xs w-40 flex-shrink-0">{f.label}</span>
                <div className="flex-1 h-1.5 bg-nav-item-active-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(f.importance * 100)}%`, background: barColor }}
                  />
                </div>
                <span className="text-xs font-mono w-10 text-right" style={{ color: barColor }}>
                  {f.importance.toFixed(3)}
                </span>
                <span className="text-[10px] text-text-secondary w-20">
                  {f.direction === "positive" ? "↑ responder" : "↑ non-resp."}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subtype breakdown table */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">Patient Subtype Summary</p>
        <div className="grid grid-cols-3 gap-4">
          {(["A", "B", "C"] as const).map(st => {
            const pts = subtypeGroups[st] ?? [];
            const color = SUBTYPE_COLORS[st];
            const responders = pts.filter(p => p.response_status === "responder").length;
            const avgMadrsReduction = pts.length > 0
              ? Math.round(pts.reduce((sum, p) => {
                  const wk8 = p.wk8_madrs ?? p.baseline_madrs;
                  return sum + ((p.baseline_madrs - wk8) / p.baseline_madrs) * 100;
                }, 0) / pts.length)
              : 0;
            return (
              <div key={st} className="p-4 border rounded-xl" style={{ borderColor: `${color}30`, background: `${color}08` }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="font-semibold text-sm text-text-heading">{SUBTYPE_LABELS[st]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-text-muted">
                  <div className="flex justify-between">
                    <span>N</span>
                    <span className="text-text-heading font-semibold">{pts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Responders</span>
                    <span style={{ color }} className="font-semibold">{responders} / {pts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg MADRS reduction</span>
                    <span className="text-text-heading font-semibold">{avgMadrsReduction}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href={`/studies/${studyId}/phase2/report`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-core to-status-purple text-white font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity"
        >
          View Final Report + CRO Prompts →
        </Link>
      </div>
    </div>
  );
}
