"use client";

import { useEffect, useState } from "react";

interface Stats {
  total_docs: number;
  total_chunks: number;
  by_source_type: Record<string, number>;
  last_updated: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  literature: "Literature",
  clinical_trial: "Clinical Trial",
  internal: "Internal",
  regulatory: "Regulatory",
};

export default function CorpusStats({ refreshTrigger, polling }: { refreshTrigger?: number; polling?: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () =>
    fetch("/api/corpus/stats")
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { fetchStats(); }, [refreshTrigger]);

  // Poll every 3s while an upload is in progress
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Documents" value={stats?.total_docs ?? 0} icon="📄" />
        <StatCard label="Chunks" value={stats?.total_chunks ?? 0} icon="🧩" />
        {Object.entries(stats?.by_source_type ?? {}).map(([type, count]) => (
          <StatCard key={type} label={SOURCE_LABELS[type] ?? type} value={count} icon="📂" />
        ))}
      </div>
      {stats?.last_updated && (
        <p className="text-[#8BA3C7] text-xs">
          Last updated: {new Date(stats.last_updated).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5">
      <div className="text-xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-[#F0F4FF]">{value.toLocaleString()}</div>
      <div className="text-[#8BA3C7] text-sm mt-0.5">{label}</div>
    </div>
  );
}
