"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Study {
  id: string;
  name: string;
  sponsor: string;
  drug_name: string;
  indication: string;
  trial_size?: number;
  phase1_run_id?: string | null;
  phase2_run_id?: string | null;
}

interface SidebarProps {
  study: Study;
}

export default function Sidebar({ study }: SidebarProps) {
  const pathname = usePathname();
  const base = `/studies/${study.id}`;

  const phase1Active = pathname.includes("/phase1");
  const phase2Active = pathname.includes("/phase2");

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const hasPhase1 = !!study.phase1_run_id;
  const hasPhase2 = !!study.phase2_run_id;

  return (
    <aside className="w-60 flex-shrink-0 bg-[#070F1E] border-r border-[#1E3A5F] flex flex-col h-screen sticky top-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#1E3A5F]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4F8EF7] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            L
          </div>
          <div>
            <div className="text-[#F0F4FF] font-semibold text-sm leading-tight">Lumos AI™</div>
            <div className="text-[#4F8EF7] text-[10px] uppercase tracking-widest">Precision Neuroscience</div>
          </div>
        </Link>
      </div>

      {/* Study context */}
      <div className="px-5 py-4 border-b border-[#1E3A5F]">
        <p className="text-[#8BA3C7] text-[10px] uppercase tracking-wider mb-1">Active Project</p>
        <p className="text-[#F0F4FF] text-sm font-semibold">{study.sponsor} · {study.drug_name}</p>
        <p className="text-[#8BA3C7] text-xs mt-0.5">{study.indication} · Phase 1 — Preclinical</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">

        {/* Phase 1 */}
        <div>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left group">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${phase1Active ? 'text-[#4F8EF7]' : 'text-[#8BA3C7]'}`}>
              ▶ Phase 1 — Preclinical
            </span>
          </button>
          <div className="mt-1 space-y-0.5 ml-2">
            <SidebarItem
              href={hasPhase1 ? `${base}/phase1/processing` : `${base}/phase1`}
              label={hasPhase1 ? "Processing Complete" : "Lumos Processing"}
              icon="⚡"
              active={pathname.includes('/phase1') && !pathname.includes('/report')}
            />
            {hasPhase1 ? (
              <SidebarItem
                href={`${base}/phase1/report`}
                label="Report #1 — Preclinical"
                icon="☰"
                active={isActive(`${base}/phase1/report`)}
              />
            ) : (
              <SidebarItem
                href={`${base}/phase1`}
                label="Report #1 — Preclinical"
                icon="○"
                muted
                active={false}
              />
            )}
          </div>
        </div>

        {/* Phase 2 */}
        <div>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${phase2Active ? 'text-[#22C55E]' : 'text-[#8BA3C7]'}`}>
              {phase2Active ? '▶' : '▷'} Phase 2 — Clinical
            </span>
          </button>
          <div className="mt-1 space-y-0.5 ml-2">
            {hasPhase1 ? (
              <>
                <SidebarItem
                  href={`${base}/phase2`}
                  label="Phase 2 — Re-Analysis"
                  icon="↻"
                  active={isActive(`${base}/phase2`) && !pathname.includes('/subtyping') && !pathname.includes('/report')}
                />
                {hasPhase2 ? (
                  <>
                    <SidebarItem
                      href={`${base}/phase2/subtyping`}
                      label="2.2 Subtyping Results"
                      icon="○"
                      active={isActive(`${base}/phase2/subtyping`)}
                    />
                    <SidebarItem
                      href={`${base}/phase2/report`}
                      label="Final Report + CRO Prompts"
                      icon="☰"
                      badge="PDF"
                      active={isActive(`${base}/phase2/report`)}
                    />
                  </>
                ) : (
                  <>
                    <SidebarItem href={`${base}/phase2`} label="2.2 Subtyping Results" icon="○" muted active={false} />
                    <SidebarItem href={`${base}/phase2`} label="Final Report + CRO Prompts" icon="○" muted active={false} />
                  </>
                )}
              </>
            ) : (
              <>
                <SidebarItem href={`${base}/phase1`} label="Phase 2 — Re-Analysis" icon="○" muted active={false} />
                <SidebarItem href={`${base}/phase1`} label="2.2 Subtyping Results" icon="○" muted active={false} />
                <SidebarItem href={`${base}/phase1`} label="Final Report + CRO Prompts" icon="○" muted active={false} />
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1E3A5F] space-y-2">
        <p className="text-[#1E3A5F] text-[10px]">HIPAA · SOC 2</p>
        <p className="text-[#1E3A5F] text-[10px]">headlamp.com/lumosai</p>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="text-[#2A4060] hover:text-[#8BA3C7] text-[10px] transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarItem({
  href, label, icon, active, badge, muted,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors ${
        active
          ? 'bg-[#1E3A5F] text-[#F0F4FF]'
          : muted
          ? 'text-[#2A4060] cursor-default pointer-events-none'
          : 'text-[#8BA3C7] hover:text-[#F0F4FF] hover:bg-[#0F1F3D]'
      }`}
    >
      <span className="text-[10px] w-3 text-center flex-shrink-0">{icon}</span>
      <span className="flex-1 leading-tight">{label}</span>
      {badge && (
        <span className="text-[9px] font-bold bg-[#1E3A5F] text-[#4F8EF7] px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </Link>
  );
}
