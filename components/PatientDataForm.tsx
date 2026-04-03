"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PatientData } from "@/lib/types";

const DEFAULT_DATA: PatientData = {
  demographics: { age: 34, sex: "F", weight_kg: 68 },
  diagnosis: { primary: "MDD", severity: "moderate-severe", episode_count: 2, duration_months: 18, hamd_score: 24 },
  prior_treatments: [
    { drug: "sertraline", dose_mg: 150, response: "partial", duration_weeks: 12 },
  ],
  biomarkers: { bdnf_serum_ng_ml: 14.2, crp_mg_l: 2.1, tnf_alpha_pg_ml: 22.4, il6_pg_ml: 3.8, cortisol_am_ug_dl: 18.9, tryptophan_ratio: 0.082 },
  genetics: { sert_genotype: "s/l", comt_val158met: "val/val", bdnf_val66met: "met/met" },
  functional: { sleep_efficiency_pct: 68, psychomotor_retardation: true, anhedonia_present: true },
  study_drug: { id: "", dose_mg: undefined, route: "oral", phase: "preclinical" },
};

function Input({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[#8BA3C7] mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-3 py-2 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5 space-y-3">
      <h3 className="text-[#F0F4FF] font-medium text-sm">{title}</h3>
      {children}
    </div>
  );
}

export default function PatientDataForm() {
  const router = useRouter();
  const [data, setData] = useState<PatientData>(DEFAULT_DATA);
  const [studyId, setStudyId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <T extends keyof PatientData>(section: T, field: keyof PatientData[T], value: unknown) => {
    setData(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/runs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_data: data, study_id: studyId, phase: "preclinical" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create run");
      router.push(`/runs/${result.run_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      {/* Study */}
      <Section title="Study">
        <Input label="Study ID" value={studyId} onChange={setStudyId} placeholder="e.g. STUDY-001" />
      </Section>

      {/* Demographics */}
      <Section title="Demographics">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Age" type="number" value={data.demographics.age} onChange={v => set("demographics", "age", Number(v))} />
          <Input label="Sex" value={data.demographics.sex} onChange={v => set("demographics", "sex", v)} placeholder="F / M" />
          <Input label="Weight (kg)" type="number" value={data.demographics.weight_kg ?? ""} onChange={v => set("demographics", "weight_kg", Number(v))} />
        </div>
      </Section>

      {/* Diagnosis */}
      <Section title="Diagnosis">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Primary diagnosis" value={data.diagnosis.primary} onChange={v => set("diagnosis", "primary", v)} />
          <Input label="Severity" value={data.diagnosis.severity} onChange={v => set("diagnosis", "severity", v)} placeholder="moderate-severe" />
          <Input label="Episode count" type="number" value={data.diagnosis.episode_count} onChange={v => set("diagnosis", "episode_count", Number(v))} />
          <Input label="Duration (months)" type="number" value={data.diagnosis.duration_months} onChange={v => set("diagnosis", "duration_months", Number(v))} />
          <Input label="HAMD-17 score" type="number" value={data.diagnosis.hamd_score} onChange={v => set("diagnosis", "hamd_score", Number(v))} />
        </div>
      </Section>

      {/* Biomarkers */}
      <Section title="Biomarkers">
        <div className="grid grid-cols-2 gap-3">
          <Input label="BDNF (ng/mL)" type="number" value={data.biomarkers.bdnf_serum_ng_ml ?? ""} onChange={v => set("biomarkers", "bdnf_serum_ng_ml", Number(v))} />
          <Input label="CRP (mg/L)" type="number" value={data.biomarkers.crp_mg_l ?? ""} onChange={v => set("biomarkers", "crp_mg_l", Number(v))} />
          <Input label="TNF-α (pg/mL)" type="number" value={data.biomarkers.tnf_alpha_pg_ml ?? ""} onChange={v => set("biomarkers", "tnf_alpha_pg_ml", Number(v))} />
          <Input label="IL-6 (pg/mL)" type="number" value={data.biomarkers.il6_pg_ml ?? ""} onChange={v => set("biomarkers", "il6_pg_ml", Number(v))} />
          <Input label="Cortisol AM (ug/dL)" type="number" value={data.biomarkers.cortisol_am_ug_dl ?? ""} onChange={v => set("biomarkers", "cortisol_am_ug_dl", Number(v))} />
          <Input label="Tryptophan ratio" type="number" value={data.biomarkers.tryptophan_ratio ?? ""} onChange={v => set("biomarkers", "tryptophan_ratio", Number(v))} />
        </div>
      </Section>

      {/* Genetics */}
      <Section title="Genetics">
        <div className="grid grid-cols-3 gap-3">
          <Input label="SERT genotype" value={data.genetics.sert_genotype ?? ""} onChange={v => set("genetics", "sert_genotype", v)} placeholder="s/l" />
          <Input label="COMT Val158Met" value={data.genetics.comt_val158met ?? ""} onChange={v => set("genetics", "comt_val158met", v)} placeholder="val/val" />
          <Input label="BDNF Val66Met" value={data.genetics.bdnf_val66met ?? ""} onChange={v => set("genetics", "bdnf_val66met", v)} placeholder="met/met" />
        </div>
      </Section>

      {/* Functional */}
      <Section title="Functional">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Sleep efficiency (%)" type="number" value={data.functional.sleep_efficiency_pct ?? ""} onChange={v => set("functional", "sleep_efficiency_pct", Number(v))} />
          <div>
            <label className="block text-xs text-[#8BA3C7] mb-1">Psychomotor retardation</label>
            <select
              value={String(data.functional.psychomotor_retardation)}
              onChange={e => set("functional", "psychomotor_retardation", e.target.value === "true")}
              className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-3 py-2 text-[#F0F4FF] text-sm focus:outline-none focus:border-[#4F8EF7]"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#8BA3C7] mb-1">Anhedonia</label>
            <select
              value={String(data.functional.anhedonia_present)}
              onChange={e => set("functional", "anhedonia_present", e.target.value === "true")}
              className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-3 py-2 text-[#F0F4FF] text-sm focus:outline-none focus:border-[#4F8EF7]"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Prior treatments */}
      <Section title="Prior Treatments">
        {data.prior_treatments.map((t, i) => (
          <div key={i} className="grid grid-cols-4 gap-3">
            <Input label="Drug" value={t.drug} onChange={v => {
              const updated = [...data.prior_treatments];
              updated[i] = { ...updated[i], drug: v };
              setData(prev => ({ ...prev, prior_treatments: updated }));
            }} />
            <Input label="Dose (mg)" type="number" value={t.dose_mg} onChange={v => {
              const updated = [...data.prior_treatments];
              updated[i] = { ...updated[i], dose_mg: Number(v) };
              setData(prev => ({ ...prev, prior_treatments: updated }));
            }} />
            <Input label="Response" value={t.response} onChange={v => {
              const updated = [...data.prior_treatments];
              updated[i] = { ...updated[i], response: v };
              setData(prev => ({ ...prev, prior_treatments: updated }));
            }} placeholder="partial/none/full" />
            <Input label="Duration (wk)" type="number" value={t.duration_weeks} onChange={v => {
              const updated = [...data.prior_treatments];
              updated[i] = { ...updated[i], duration_weeks: Number(v) };
              setData(prev => ({ ...prev, prior_treatments: updated }));
            }} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setData(prev => ({ ...prev, prior_treatments: [...prev.prior_treatments, { drug: "", dose_mg: 0, response: "", duration_weeks: 0 }] }))}
          className="text-[#4F8EF7] text-sm hover:underline"
        >
          + Add treatment
        </button>
      </Section>

      {error && (
        <div className="bg-[#EF444420] border border-[#EF4444] rounded-lg p-4 text-[#EF4444] text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || !studyId}
        className="w-full bg-[#4F8EF7] hover:bg-[#3A7AE4] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors"
      >
        {submitting ? "Submitting…" : "Run phenotyping analysis"}
      </button>
    </form>
  );
}
