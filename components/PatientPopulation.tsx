"use client";

import { useState, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClinicalPatientFull {
  patient_code: string;
  age: number;
  sex: string;
  prior_ad_trials: number;
  baseline_hamd17: number;
  baseline_madrs: number;
  baseline_bdnf_ng_ml: number;
  baseline_il6_pg_ml: number;
  baseline_crp_mg_l: number;
  baseline_tnf_alpha_pg_ml: number;
  baseline_sleep_regularity: number;
  baseline_anhedonia_subscale: number;
  wk2_madrs: number | null;
  wk4_madrs: number | null;
  wk8_madrs: number | null;
  wk2_bdnf: number | null;
  wk4_il6: number | null;
  response_status: "responder" | "nonresponder" | "uncertain";
  subtype_label: "A" | "B" | "C";
}

type SubtypeFilter = "All" | "A" | "B" | "C";
type SortDir = "asc" | "desc";
type SortKey =
  | "patient_code"
  | "subtype_label"
  | "response_status"
  | "baseline_madrs"
  | "baseline_bdnf_ng_ml"
  | "baseline_il6_pg_ml"
  | "wk8_madrs"
  | "madrs_reduction";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBTYPE_COLORS: Record<string, string> = {
  A: "#22C55E",
  B: "#EF4444",
  C: "#F59E0B",
};

const STATUS_COLORS: Record<string, string> = {
  responder: "#22C55E",
  nonresponder: "#EF4444",
  uncertain: "#F59E0B",
};

const STATUS_LABELS: Record<string, string> = {
  responder: "Responder",
  nonresponder: "Non-Responder",
  uncertain: "Uncertain",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt1(v: number) {
  return v.toFixed(1);
}

function madrsReduction(p: ClinicalPatientFull): number | null {
  if (p.wk8_madrs === null) return null;
  return ((p.baseline_madrs - p.wk8_madrs) / p.baseline_madrs) * 100;
}

function subtypeRationale(p: ClinicalPatientFull): string {
  if (p.subtype_label === "A")
    return `BDNF ${fmt1(p.baseline_bdnf_ng_ml)} ng/mL < 15 ng/mL threshold → TrkB-deficit phenotype. Low BDNF indicates impaired neurotrophin signalling that XYL-1001's TrkB agonism is designed to restore.`;
  if (p.subtype_label === "B")
    return `IL-6 ${fmt1(p.baseline_il6_pg_ml)} pg/mL ≥ 4 pg/mL threshold → High-inflammatory phenotype. Elevated neuroinflammation attenuates TrkB-mediated plasticity, predicting non-response.`;
  return `BDNF ${fmt1(p.baseline_bdnf_ng_ml)} ng/mL and IL-6 ${fmt1(p.baseline_il6_pg_ml)} pg/mL both within intermediate range — neither threshold criterion met. Mixed phenotype; response uncertain.`;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function MadrsSparkline({ p }: { p: ClinicalPatientFull }) {
  const W = 80, H = 28, PAD = 4;
  const vMin = 0, vMax = 50;
  const wk8 = p.wk8_madrs;
  const pts = [
    p.baseline_madrs,
    p.wk2_madrs ?? p.baseline_madrs,
    p.wk4_madrs ?? p.baseline_madrs,
    wk8 ?? p.wk4_madrs ?? p.baseline_madrs,
  ];
  const xs = [PAD, PAD + (W - PAD * 2) / 3, PAD + (2 * (W - PAD * 2)) / 3, W - PAD];
  const scaleY = (v: number) => PAD + ((vMax - v) / (vMax - vMin)) * (H - PAD * 2);
  const polyPts = pts.map((v, i) => `${xs[i]},${scaleY(v)}`).join(" ");

  const reduction = wk8 !== null ? (p.baseline_madrs - wk8) / p.baseline_madrs : null;
  const color =
    reduction === null ? "#F59E0B" : reduction >= 0.5 ? "#22C55E" : reduction >= 0 ? "#4F8EF7" : "#EF4444";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      <polyline
        points={polyPts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={wk8 === null ? "3,2" : undefined}
      />
      {pts.map((v, i) => (
        <circle key={i} cx={xs[i]} cy={scaleY(v)} r="2" fill={color} />
      ))}
    </svg>
  );
}

// ── Patient detail panel ──────────────────────────────────────────────────────

function DetailPanel({ p }: { p: ClinicalPatientFull }) {
  const subtypeColor = SUBTYPE_COLORS[p.subtype_label] ?? "#8BA3C7";
  const reduction = madrsReduction(p);

  // Mini MADRS trajectory SVG (larger)
  const W = 280, H = 80, PAD = 16;
  const vMin = 0, vMax = 50;
  const timepoints = [p.baseline_madrs, p.wk2_madrs ?? p.baseline_madrs, p.wk4_madrs ?? p.baseline_madrs, p.wk8_madrs ?? p.wk4_madrs ?? p.baseline_madrs];
  const xs = [PAD, PAD + (W - PAD * 2) / 3, PAD + (2 * (W - PAD * 2)) / 3, W - PAD];
  const scaleY = (v: number) => PAD + ((vMax - v) / (vMax - vMin)) * (H - PAD * 2);
  const polyPts = timepoints.map((v, i) => `${xs[i]},${scaleY(v)}`).join(" ");
  const lineColor = reduction === null ? "#F59E0B" : reduction >= 0.5 ? "#22C55E" : reduction >= 0 ? "#4F8EF7" : "#EF4444";
  const labels = ["Wk 0", "Wk 2", "Wk 4", "Wk 8"];

  return (
    <div
      className="p-5 border-t-2"
      style={{ background: "#0B1829", borderColor: subtypeColor }}
    >
      <div className="grid grid-cols-5 gap-5">
        {/* Left col — biomarkers + trajectory */}
        <div className="col-span-3 space-y-4">
          {/* MADRS trajectory */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">MADRS Trajectory</p>
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#1E3A5F]">
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block w-full">
                {/* Grid lines */}
                {[10, 20, 30, 40].map(v => (
                  <line
                    key={v}
                    x1={PAD} y1={scaleY(v)} x2={W - PAD} y2={scaleY(v)}
                    stroke="#1E3A5F" strokeWidth="0.5" strokeDasharray="2,2"
                  />
                ))}
                <polyline points={polyPts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={p.wk8_madrs === null ? "4,2" : undefined}
                />
                {timepoints.map((v, i) => (
                  <g key={i}>
                    <circle cx={xs[i]} cy={scaleY(v)} r="3" fill={lineColor} />
                    <text x={xs[i]} y={scaleY(v) - 6} textAnchor="middle" fontSize="8" fill="#8BA3C7">{v}</text>
                    <text x={xs[i]} y={H - 2} textAnchor="middle" fontSize="8" fill="#4A6580">{labels[i]}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Baseline biomarkers grid */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Baseline Biomarkers</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "BDNF", value: `${fmt1(p.baseline_bdnf_ng_ml)} ng/mL`, highlight: p.baseline_bdnf_ng_ml < 15 },
                { label: "IL-6", value: `${fmt1(p.baseline_il6_pg_ml)} pg/mL`, highlight: p.baseline_il6_pg_ml >= 4 },
                { label: "CRP", value: `${fmt1(p.baseline_crp_mg_l)} mg/L`, highlight: false },
                { label: "TNF-α", value: `${fmt1(p.baseline_tnf_alpha_pg_ml)} pg/mL`, highlight: false },
                { label: "HAMD-17", value: String(p.baseline_hamd17), highlight: false },
                { label: "MADRS", value: String(p.baseline_madrs), highlight: false },
              ].map(b => (
                <div
                  key={b.label}
                  className="p-2 rounded-lg border"
                  style={{
                    background: b.highlight ? `${subtypeColor}10` : "#080F1F",
                    borderColor: b.highlight ? `${subtypeColor}40` : "#1E3A5F",
                  }}
                >
                  <p className="text-[9px] uppercase tracking-wider text-[#4A6580]">{b.label}</p>
                  <p className="text-xs font-mono font-semibold mt-0.5" style={{ color: b.highlight ? subtypeColor : "#D0DCF0" }}>
                    {b.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up biomarkers */}
          {(p.wk2_bdnf !== null || p.wk4_il6 !== null) && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Follow-Up Biomarkers</p>
              <div className="grid grid-cols-2 gap-2">
                {p.wk2_bdnf !== null && (
                  <div className="p-2 rounded-lg border border-[#1E3A5F] bg-[#080F1F]">
                    <p className="text-[9px] uppercase tracking-wider text-[#4A6580]">BDNF Wk 2</p>
                    <p className="text-xs font-mono font-semibold text-[#D0DCF0] mt-0.5">{fmt1(p.wk2_bdnf)} ng/mL</p>
                  </div>
                )}
                {p.wk4_il6 !== null && (
                  <div className="p-2 rounded-lg border border-[#1E3A5F] bg-[#080F1F]">
                    <p className="text-[9px] uppercase tracking-wider text-[#4A6580]">IL-6 Wk 4</p>
                    <p className="text-xs font-mono font-semibold text-[#D0DCF0] mt-0.5">{fmt1(p.wk4_il6)} pg/mL</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right col — subtype rationale + demographics */}
        <div className="col-span-2 space-y-4">
          {/* Subtype card */}
          <div className="p-4 rounded-xl border" style={{ borderColor: `${subtypeColor}30`, background: `${subtypeColor}08` }}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ color: subtypeColor, background: `${subtypeColor}20` }}
              >
                Subtype {p.subtype_label}
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ color: STATUS_COLORS[p.response_status], background: `${STATUS_COLORS[p.response_status]}15` }}
              >
                {STATUS_LABELS[p.response_status]}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Subtype Assignment</p>
            <p className="text-[#8BA3C7] text-xs leading-relaxed">{subtypeRationale(p)}</p>
            {reduction !== null && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: `${subtypeColor}20` }}>
                <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">MADRS Reduction (Wk 8)</p>
                <p className="text-xl font-bold" style={{ color: lineColor }}>
                  {reduction >= 0 ? "-" : "+"}{Math.abs(reduction).toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {/* Demographics */}
          <div className="p-4 rounded-xl border border-[#1E3A5F] bg-[#080F1F]">
            <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-3">Demographics & History</p>
            <div className="space-y-2">
              {[
                { label: "Age", value: `${p.age} years` },
                { label: "Sex", value: p.sex === "F" ? "Female" : "Male" },
                { label: "Prior AD trials", value: String(p.prior_ad_trials) },
                { label: "Sleep regularity", value: `${(p.baseline_sleep_regularity * 100).toFixed(0)}%` },
                { label: "Anhedonia subscale", value: `${p.baseline_anhedonia_subscale}/14` },
              ].map(r => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-[#4A6580] text-xs">{r.label}</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cohort overview bar ───────────────────────────────────────────────────────

function CohortOverview({ patients }: { patients: ClinicalPatientFull[] }) {
  const n = patients.length;
  const responders = patients.filter(p => p.response_status === "responder").length;
  const nonresponders = patients.filter(p => p.response_status === "nonresponder").length;
  const uncertain = patients.filter(p => p.response_status === "uncertain").length;
  const subtypeA = patients.filter(p => p.subtype_label === "A").length;
  const subtypeB = patients.filter(p => p.subtype_label === "B").length;
  const subtypeC = patients.filter(p => p.subtype_label === "C").length;
  const avgAge = patients.reduce((s, p) => s + p.age, 0) / n;
  const female = patients.filter(p => p.sex === "F").length;
  const avgMadrs = patients.reduce((s, p) => s + p.baseline_madrs, 0) / n;

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Cohort Size</p>
        <p className="text-2xl font-bold text-[#F0F4FF]">N={n}</p>
        <p className="text-[#4A6580] text-xs mt-0.5">XYL-1001 Phase 1</p>
      </div>
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Response Rate</p>
        <p className="text-2xl font-bold text-[#22C55E]">{Math.round((responders / n) * 100)}%</p>
        <p className="text-[#4A6580] text-xs mt-0.5">{responders} responders</p>
      </div>
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Subtypes</p>
        <div className="flex items-center gap-2 flex-wrap">
          {[{ label: "A", n: subtypeA }, { label: "B", n: subtypeB }, { label: "C", n: subtypeC }].map(s => (
            <span
              key={s.label}
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ color: SUBTYPE_COLORS[s.label], background: `${SUBTYPE_COLORS[s.label]}20` }}
            >
              {s.label}: {s.n}
            </span>
          ))}
        </div>
        <p className="text-[#4A6580] text-xs mt-1.5">{nonresponders} non-resp · {uncertain} uncertain</p>
      </div>
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Demographics</p>
        <p className="text-lg font-bold text-[#F0F4FF]">{Math.round(avgAge)} yrs avg</p>
        <p className="text-[#4A6580] text-xs mt-0.5">{female}F / {n - female}M</p>
      </div>
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Avg Baseline MADRS</p>
        <p className="text-2xl font-bold text-[#F0F4FF]">{fmt1(avgMadrs)}</p>
        <p className="text-[#4A6580] text-xs mt-0.5">Moderate–severe MDD</p>
      </div>
    </div>
  );
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="text-[#2A4060] ml-1">↕</span>;
  return <span className="text-[#4F8EF7] ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PatientPopulation({
  patients,
  drugName,
}: {
  studyId: string;
  drugName: string;
  patients: ClinicalPatientFull[];
}) {
  const [subtypeFilter, setSubtypeFilter] = useState<SubtypeFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("patient_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<string | null>(null);

  const handleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
    setSelected(null);
  };

  const visible = useMemo(() => {
    let list = subtypeFilter === "All" ? patients : patients.filter(p => p.subtype_label === subtypeFilter);
    list = [...list].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortKey === "madrs_reduction") {
        aVal = madrsReduction(a) ?? -999;
        bVal = madrsReduction(b) ?? -999;
      } else if (sortKey === "wk8_madrs") {
        aVal = a.wk8_madrs ?? 999;
        bVal = b.wk8_madrs ?? 999;
      } else {
        aVal = a[sortKey] as string | number;
        bVal = b[sortKey] as string | number;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [patients, subtypeFilter, sortKey, sortDir]);

  const thClass = "px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-[#4A6580] cursor-pointer hover:text-[#8BA3C7] select-none whitespace-nowrap";

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[#A855F7] text-xs uppercase tracking-widest font-semibold mb-1">
          Clinical Analysis · Patient Data
        </p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">Patient Population</h1>
        <p className="text-[#8BA3C7] text-sm">
          {drugName} · XYL-1001 Phase 1 trial · N={patients.length} enrolled participants
        </p>
      </div>

      {/* Cohort overview */}
      <CohortOverview patients={patients} />

      {/* Filter bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {(["All", "A", "B", "C"] as SubtypeFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setSubtypeFilter(f); setSelected(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={
                subtypeFilter === f
                  ? {
                      background: f === "All" ? "#1E3A5F" : `${SUBTYPE_COLORS[f]}20`,
                      color: f === "All" ? "#F0F4FF" : SUBTYPE_COLORS[f],
                      border: `1px solid ${f === "All" ? "#1E3A5F" : `${SUBTYPE_COLORS[f]}50`}`,
                    }
                  : { background: "transparent", color: "#4A6580", border: "1px solid #1E3A5F" }
              }
            >
              {f === "All" ? "All Patients" : (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SUBTYPE_COLORS[f] }} />
                  Subtype {f}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-[#4A6580] text-xs">
          {subtypeFilter === "All"
            ? `Showing all ${visible.length} patients`
            : `Showing ${visible.length} Subtype ${subtypeFilter} patients`}
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#080F1F] border border-[#1E3A5F] rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#0F1F3D] border-b border-[#1E3A5F]">
              <th className={thClass} onClick={() => handleSort("patient_code")}>
                Patient <SortIcon col="patient_code" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("subtype_label")}>
                Subtype <SortIcon col="subtype_label" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("response_status")}>
                Status <SortIcon col="response_status" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("baseline_madrs")}>
                MADRS₀ <SortIcon col="baseline_madrs" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("baseline_bdnf_ng_ml")}>
                BDNF (ng/mL) <SortIcon col="baseline_bdnf_ng_ml" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("baseline_il6_pg_ml")}>
                IL-6 (pg/mL) <SortIcon col="baseline_il6_pg_ml" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("wk8_madrs")}>
                MADRS Wk 8 <SortIcon col="wk8_madrs" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("madrs_reduction")}>
                Reduction <SortIcon col="madrs_reduction" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-[#4A6580] whitespace-nowrap">
                Trajectory
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, idx) => {
              const isSelected = selected === p.patient_code;
              const subtypeColor = SUBTYPE_COLORS[p.subtype_label];
              const statusColor = STATUS_COLORS[p.response_status];
              const reduction = madrsReduction(p);
              const isEven = idx % 2 === 0;

              return (
                <>
                  <tr
                    key={p.patient_code}
                    onClick={() => setSelected(isSelected ? null : p.patient_code)}
                    className="cursor-pointer transition-colors border-b border-[#0D1A2E]"
                    style={{ background: isSelected ? "#1E3A5F30" : isEven ? "#080F1F" : "#07111F" }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#0F1F3D"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isEven ? "#080F1F" : "#07111F"; }}
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono font-semibold text-[#F0F4FF]">{p.patient_code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ color: subtypeColor, background: `${subtypeColor}20` }}
                      >
                        {p.subtype_label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{ color: statusColor, background: `${statusColor}15` }}
                      >
                        {STATUS_LABELS[p.response_status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-[#D0DCF0]">{p.baseline_madrs}</td>
                    <td className="px-3 py-2.5 text-xs font-mono" style={{ color: p.baseline_bdnf_ng_ml < 15 ? "#22C55E" : "#D0DCF0" }}>
                      {fmt1(p.baseline_bdnf_ng_ml)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono" style={{ color: p.baseline_il6_pg_ml >= 4 ? "#EF4444" : "#D0DCF0" }}>
                      {fmt1(p.baseline_il6_pg_ml)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-[#D0DCF0]">
                      {p.wk8_madrs !== null ? p.wk8_madrs : <span className="text-[#2A4060]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono font-semibold">
                      {reduction !== null ? (
                        <span style={{ color: reduction >= 50 ? "#22C55E" : reduction >= 0 ? "#4F8EF7" : "#EF4444" }}>
                          {reduction >= 0 ? "-" : "+"}{Math.abs(reduction).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[#2A4060]">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <MadrsSparkline p={p} />
                    </td>
                  </tr>
                  {isSelected && (
                    <tr key={`${p.patient_code}-detail`}>
                      <td colSpan={9} className="p-0">
                        <DetailPanel p={p} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[#2A4060] text-xs mt-6">
        Click any row to expand patient detail · Subtype thresholds: BDNF &lt; 15 ng/mL → A · IL-6 ≥ 4 pg/mL → B · Mixed → C
      </p>
    </div>
  );
}
