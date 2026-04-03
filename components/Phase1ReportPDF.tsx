import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";

// ── Styles ────────────────────────────────────────────────────────────────────
const c = {
  navy:    "#0A1628",
  blue:    "#4F8EF7",
  green:   "#22C55E",
  red:     "#EF4444",
  amber:   "#F59E0B",
  purple:  "#A855F7",
  white:   "#F0F4FF",
  muted:   "#8BA3C7",
  dim:     "#4A6580",
  border:  "#1E3A5F",
  card:    "#0F1F3D",
  dark:    "#070F1E",
};

const s = StyleSheet.create({
  page: {
    backgroundColor: c.navy,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    color: c.white,
  },
  // ── Header
  header: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logoBox: { width: 22, height: 22, backgroundColor: c.blue, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 10, fontFamily: "Helvetica-Bold" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  brandName: { color: c.white, fontSize: 11, fontFamily: "Helvetica-Bold" },
  brandSub: { color: c.blue, fontSize: 7, letterSpacing: 1.5 },
  eyebrow: { color: c.blue, fontSize: 7, letterSpacing: 1.5, marginBottom: 4 },
  title: { color: c.white, fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { color: c.muted, fontSize: 8 },
  confidencePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  confidenceText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  // ── Section
  section: { marginBottom: 18 },
  sectionLabel: { fontSize: 7, letterSpacing: 1.5, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  // ── Cards
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 12, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  // ── Two-column grid
  grid2: { flexDirection: "row", gap: 10, marginBottom: 14 },
  col: { flex: 1 },
  // ── Typography
  h2: { color: c.white, fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h3: { color: c.white, fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  body: { color: "#D0DCF0", fontSize: 8, lineHeight: 1.5 },
  label: { color: c.muted, fontSize: 6.5, letterSpacing: 0.8, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  small: { color: c.dim, fontSize: 7, lineHeight: 1.4 },
  italic: { color: c.dim, fontSize: 7, fontStyle: "italic" },
  // ── Biomarker
  rankCircle: { width: 16, height: 16, backgroundColor: c.border, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rankText: { color: c.blue, fontSize: 7, fontFamily: "Helvetica-Bold" },
  progressBg: { height: 3, backgroundColor: c.border, borderRadius: 2, marginBottom: 6, marginTop: 4 },
  progressFill: { height: 3, borderRadius: 2 },
  thresholdRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  thresholdBox: { flex: 1, borderRadius: 4, padding: 6, borderWidth: 1 },
  timingRow: { flexDirection: "row", gap: 4, marginTop: 5, flexWrap: "wrap" },
  timingPill: { backgroundColor: c.border, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  timingText: { color: c.muted, fontSize: 6.5 },
  // ── Footer
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 },
  footerText: { color: c.dim, fontSize: 6.5 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function confColor(v: number) {
  return v >= 0.7 ? c.green : v >= 0.45 ? c.amber : c.red;
}

function domainColor(d: string) {
  const m: Record<string, string> = {
    inflammatory: c.red, neuroplasticity: c.purple,
    behavioral: c.amber, imaging: c.blue, genetic: c.green,
  };
  return m[d] ?? c.muted;
}

function ConfPill({ value }: { value: number }) {
  const col = confColor(value);
  const pct = Math.round(value * 100);
  return (
    <View style={[s.confidencePill, { backgroundColor: `${col}22`, borderWidth: 1, borderColor: col }]}>
      <Text style={[s.confidenceText, { color: col }]}>{pct}% confidence</Text>
    </View>
  );
}

function SectionLabel({ text, color = c.blue }: { text: string; color?: string }) {
  return <Text style={[s.sectionLabel, { color }]}>{text}</Text>;
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={s.body}>{value}</Text>
    </View>
  );
}

function Footer({ drugName, date }: { drugName: string; date: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Lumos AI™ · {drugName} Phase 1 Preclinical Report · Headlamp Health</Text>
      <Text style={s.footerText}>{date} · Confidential</Text>
    </View>
  );
}

// ── Main PDF Document ─────────────────────────────────────────────────────────
export function Phase1PDF({
  report,
  drugName,
  indication,
  generatedAt,
}: {
  report: Phase1ReportData;
  drugName: string;
  indication: string;
  generatedAt: string;
}) {
  const genDate = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <Document title={`${drugName} Phase 1 Preclinical Report — Lumos AI`} author="Headlamp Health">

      {/* ══ PAGE 1: Cover + Methodology ══════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <Footer drugName={drugName} date={genDate} />

        {/* Brand + header */}
        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={s.logoBox}><Text style={s.logoText}>L</Text></View>
            <View>
              <Text style={s.brandName}>Lumos AI™</Text>
              <Text style={s.brandSub}>PRECISION NEUROSCIENCE · HEADLAMP HEALTH</Text>
            </View>
          </View>
          <View style={s.headerRow}>
            <View>
              <Text style={s.eyebrow}>PHASE 1 — PRECLINICAL REPORT</Text>
              <Text style={s.title}>{drugName} · {indication}</Text>
              <Text style={s.subtitle}>Generated {genDate} · Pre-clinical corpus analysis · No patient data</Text>
            </View>
            <ConfPill value={report.overall_confidence} />
          </View>
        </View>

        {/* Full methodology narrative */}
        <SectionLabel text="METHODOLOGY" color={c.blue} />
        <View style={[s.card, { marginBottom: 14 }]}>
          <Text style={s.body}>{report.methodology_narrative}</Text>
        </View>

        {/* Confidence scores */}
        <SectionLabel text="CONFIDENCE SUMMARY" color={c.blue} />
        <View style={s.grid2}>
          <View style={[s.card, { flex: 1 }]}>
            <Text style={[s.label, { color: c.green, marginBottom: 4 }]}>RESPONDER PROFILE</Text>
            <ConfPill value={report.responder_profile.corpus_hypothesis_confidence} />
          </View>
          <View style={[s.card, { flex: 1 }]}>
            <Text style={[s.label, { color: c.red, marginBottom: 4 }]}>NON-RESPONDER PROFILE</Text>
            <ConfPill value={report.nonresponder_profile.corpus_hypothesis_confidence} />
          </View>
          <View style={[s.card, { flex: 1 }]}>
            <Text style={[s.label, { color: c.blue, marginBottom: 4 }]}>OVERALL ANALYSIS</Text>
            <ConfPill value={report.overall_confidence} />
          </View>
        </View>
      </Page>

      {/* ══ PAGE 2: Phenotype Profiles ════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <Footer drugName={drugName} date={genDate} />
        <SectionLabel text="PHENOTYPE PROFILES" color={c.blue} />

        {/* Profiles grid */}
        <View style={s.grid2}>
          {/* Responder */}
          <View style={[s.col, s.card]}>
            <View style={s.cardRow}>
              <View>
                <Text style={[s.label, { color: c.green }]}>PREDICTED RESPONDER</Text>
                <Text style={s.h2}>{report.responder_profile.primary_subtype}</Text>
              </View>
              <ConfPill value={report.responder_profile.corpus_hypothesis_confidence} />
            </View>
            <Text style={[s.body, { marginBottom: 8 }]}>{report.responder_profile.summary}</Text>
            <FieldBlock label="Demographics" value={report.responder_profile.demographics} />
            <FieldBlock label="Core Clinical" value={report.responder_profile.core_clinical} />
            <FieldBlock label="Inflammatory" value={report.responder_profile.inflammatory} />
            <FieldBlock label="Neuroplasticity" value={report.responder_profile.neuroplasticity} />
            {report.responder_profile.imaging && <FieldBlock label="Imaging" value={report.responder_profile.imaging} />}
            {report.responder_profile.key_inclusion_criteria?.length > 0 && (
              <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={s.label}>KEY INCLUSION CRITERIA</Text>
                {report.responder_profile.key_inclusion_criteria.map((cr, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 4, marginBottom: 3 }}>
                    <Text style={{ color: c.green, fontSize: 8 }}>✓</Text>
                    <Text style={s.body}>{cr}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Non-responder */}
          <View style={[s.col, s.card]}>
            <View style={s.cardRow}>
              <View>
                <Text style={[s.label, { color: c.red }]}>PREDICTED NON-RESPONDER</Text>
                <Text style={s.h2}>{report.nonresponder_profile.primary_subtype}</Text>
              </View>
              <ConfPill value={report.nonresponder_profile.corpus_hypothesis_confidence} />
            </View>
            <Text style={[s.body, { marginBottom: 8 }]}>{report.nonresponder_profile.summary}</Text>
            <FieldBlock label="Demographics" value={report.nonresponder_profile.demographics} />
            <FieldBlock label="Core Clinical" value={report.nonresponder_profile.core_clinical} />
            <FieldBlock label="Inflammatory" value={report.nonresponder_profile.inflammatory} />
            <FieldBlock label="Neuroplasticity" value={report.nonresponder_profile.neuroplasticity} />
            {report.nonresponder_profile.imaging && <FieldBlock label="Imaging" value={report.nonresponder_profile.imaging} />}
            {report.nonresponder_profile.key_exclusion_criteria?.length > 0 && (
              <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={s.label}>KEY EXCLUSION CRITERIA</Text>
                {report.nonresponder_profile.key_exclusion_criteria.map((cr, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 4, marginBottom: 3 }}>
                    <Text style={{ color: c.red, fontSize: 8 }}>✕</Text>
                    <Text style={s.body}>{cr}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Page>

      {/* ══ PAGE 2: Biomarker Protocol ════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <Footer drugName={drugName} date={genDate} />
        <SectionLabel text="📊  BIOMARKER COLLECTION PROTOCOL" color={c.blue} />

        {(report.primary_endpoint_recommendation || report.early_response_indicator) && (
          <View style={[s.grid2, { marginBottom: 12 }]}>
            {report.primary_endpoint_recommendation && (
              <View style={[s.col, s.card, { borderColor: `${c.blue}60` }]}>
                <Text style={[s.label, { color: c.blue, marginBottom: 3 }]}>PRIMARY ENDPOINT RECOMMENDATION</Text>
                <Text style={s.body}>{report.primary_endpoint_recommendation}</Text>
              </View>
            )}
            {report.early_response_indicator && (
              <View style={[s.col, s.card, { borderColor: `${c.green}60` }]}>
                <Text style={[s.label, { color: c.green, marginBottom: 3 }]}>EARLY RESPONSE INDICATOR</Text>
                <Text style={s.body}>{report.early_response_indicator}</Text>
              </View>
            )}
          </View>
        )}

        {report.biomarker_recommendations?.sort((a, b) => a.rank - b.rank).map((bm) => {
          const dc = domainColor(bm.domain);
          const barWidth = `${bm.priority_pct}%`;
          return (
            <View key={bm.rank} style={s.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={s.rankCircle}><Text style={s.rankText}>{bm.rank}</Text></View>
                  <Text style={s.h3}>{bm.name}{bm.unit ? ` (${bm.unit})` : ""}</Text>
                </View>
                <View style={[s.confidencePill, { backgroundColor: `${dc}22`, borderWidth: 1, borderColor: dc }]}>
                  <Text style={[s.confidenceText, { color: dc }]}>{bm.domain} · {bm.priority_pct}</Text>
                </View>
              </View>

              {/* Priority bar */}
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: barWidth, backgroundColor: dc }]} />
              </View>

              <Text style={s.body}>{bm.preclinical_rationale}</Text>

              <View style={s.thresholdRow}>
                <View style={[s.thresholdBox, { backgroundColor: "#0A1F0A", borderColor: `${c.green}30` }]}>
                  <Text style={[s.label, { color: c.green }]}>RESPONDER SIGNAL</Text>
                  <Text style={s.body}>{bm.responder_threshold}</Text>
                </View>
                <View style={[s.thresholdBox, { backgroundColor: "#1A0A0A", borderColor: `${c.red}30` }]}>
                  <Text style={[s.label, { color: c.red }]}>NON-RESPONDER SIGNAL</Text>
                  <Text style={s.body}>{bm.nonresponder_threshold}</Text>
                </View>
              </View>

              <View style={s.timingRow}>
                <Text style={[s.small, { marginRight: 2 }]}>Timing:</Text>
                {bm.timing.map((t) => (
                  <View key={t} style={s.timingPill}><Text style={s.timingText}>{t}</Text></View>
                ))}
                <Text style={[s.small, { marginLeft: 4 }]}>· {bm.collection_method}</Text>
              </View>
            </View>
          );
        })}
        {report.protocol_notes && (
          <Text style={[s.small, { marginTop: 6 }]}>{report.protocol_notes}</Text>
        )}
      </Page>

      {/* ══ PAGE 3: Evidence & Safety ═════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <Footer drugName={drugName} date={genDate} />

        {report.cross_species_evidence?.length > 0 && (
          <View style={s.section}>
            <SectionLabel text="🐭  CROSS-SPECIES EVIDENCE" color={c.purple} />
            {report.cross_species_evidence.map((ev, i) => (
              <View key={i} style={s.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <Text style={s.h3}>{ev.animal_model}</Text>
                    <Text style={[s.small, { color: c.dim }]}>→</Text>
                    <Text style={[s.h3, { color: c.purple }]}>{ev.human_subtype_mapping}</Text>
                  </View>
                  <View style={[s.confidencePill, { backgroundColor: `${c.amber}22`, borderWidth: 1, borderColor: c.amber }]}>
                    <Text style={[s.confidenceText, { color: c.amber }]}>{ev.signal_strength}</Text>
                  </View>
                </View>
                {ev.key_biomarker_signals?.length > 0 && (
                  <View style={[s.timingRow, { marginBottom: 4 }]}>
                    {ev.key_biomarker_signals.map((sig, j) => (
                      <View key={j} style={s.timingPill}><Text style={s.timingText}>{sig}</Text></View>
                    ))}
                  </View>
                )}
                {ev.corpus_ref && <Text style={s.italic}>{ev.corpus_ref}</Text>}
              </View>
            ))}
          </View>
        )}

        {report.safety_flags?.length > 0 && (
          <View style={s.section}>
            <SectionLabel text="⚠️  SAFETY SIGNALS" color={c.amber} />
            {report.safety_flags.map((flag, i) => {
              const sc = flag.severity === "high" ? c.red : flag.severity === "medium" ? c.amber : c.dim;
              return (
                <View key={i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.h3}>{flag.signal}</Text>
                    <View style={[s.confidencePill, { backgroundColor: `${sc}22`, borderWidth: 1, borderColor: sc }]}>
                      <Text style={[s.confidenceText, { color: sc }]}>{flag.severity}</Text>
                    </View>
                  </View>
                  <Text style={[s.body, { marginBottom: 3 }]}>{flag.clinical_implication}</Text>
                  <Text style={s.italic}>Source: {flag.source}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Disclaimer */}
        <View style={[s.card, { marginTop: 8, borderColor: c.border }]}>
          <Text style={[s.label, { marginBottom: 4 }]}>IMPORTANT LIMITATIONS</Text>
          <Text style={s.small}>
            This report is generated from pre-clinical corpus evidence only. All efficacy signals are from in vitro or animal model studies; no human clinical data has been collected. Predictions are hypotheses to be tested in the Phase 1 trial, not established findings. Confidence scores reflect corpus evidence strength, not clinical validation. This document is intended for internal research planning purposes only.
          </Text>
        </View>
      </Page>

    </Document>
  );
}
