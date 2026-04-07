"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

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
    <aside className="w-60 flex-shrink-0 bg-nav-bg border-r border-border-emphasis flex flex-col h-screen sticky top-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-border-emphasis">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-core flex items-center justify-center text-text-inverse font-bold text-sm flex-shrink-0">
            L
          </div>
          <div>
            <div className="text-text-heading font-semibold text-sm leading-tight">Lumos AI™</div>
            <div className="text-brand-core text-[10px] uppercase tracking-widest">Precision Neuroscience</div>
          </div>
        </Link>
      </div>

      {/* Study context */}
      <div className="px-5 py-4 border-b border-border-emphasis">
        <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Active Project</p>
        <p className="text-text-heading text-sm font-semibold">{study.sponsor} · {study.drug_name}</p>
        {/* SCIENCE-FEEDBACK: P1-A */}
        <p className="text-text-muted text-xs mt-0.5">{study.indication} · Planning Phase</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">

        {/* Study Overview */}
        <div>
          <SidebarItem
            href={`${base}/overview`}
            label="Study Overview"
            icon="◎"
            active={isActive(`${base}/overview`)}
          />
        </div>

        {/* Phase 1 */}
        <div>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left group">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${phase1Active ? 'text-brand-core' : 'text-text-muted'}`}>
              ▶ Planning Phase
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
                label="Planning Phase Report"
                icon="☰"
                active={isActive(`${base}/phase1/report`)}
              />
            ) : (
              <SidebarItem
                href={`${base}/phase1`}
                label="Planning Phase Report"
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
            <span className={`text-[10px] font-bold uppercase tracking-widest ${phase2Active ? 'text-status-success' : 'text-text-muted'}`}>
              {phase2Active ? '▶' : '▷'} Clinical Analysis
            </span>
          </button>
          <div className="mt-1 space-y-0.5 ml-2">
            {hasPhase1 ? (
              <>
                <SidebarItem
                  href={hasPhase2 ? `${base}/phase2/processing` : `${base}/phase2`}
                  label={hasPhase2 ? "Analysis Complete" : "Run Clinical Analysis"}
                  icon="↻"
                  active={
                    (isActive(`${base}/phase2`) && !pathname.includes('/subtyping') && !pathname.includes('/report')) ||
                    isActive(`${base}/phase2/processing`)
                  }
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
                      href={`${base}/phase2/patients`}
                      label="Patient Population"
                      icon="◉"
                      active={isActive(`${base}/phase2/patients`)}
                    />
                    <SidebarItem
                      href={`${base}/phase2/report`}
                      label="Final Report + CRO Prompts"
                      icon="☰"
                      active={isActive(`${base}/phase2/report`)}
                    />
                  </>
                ) : (
                  <>
                    <SidebarItem href={`${base}/phase2`} label="2.2 Subtyping Results" icon="○" muted active={false} />
                    <SidebarItem href={`${base}/phase2`} label="Patient Population" icon="○" muted active={false} />
                    <SidebarItem href={`${base}/phase2`} label="Final Report + CRO Prompts" icon="○" muted active={false} />
                  </>
                )}
              </>
            ) : (
              <>
                <SidebarItem href={`${base}/phase1`} label="Run Clinical Analysis" icon="○" muted active={false} />
                <SidebarItem href={`${base}/phase1`} label="2.2 Subtyping Results" icon="○" muted active={false} />
                <SidebarItem href={`${base}/phase1`} label="Patient Population" icon="○" muted active={false} />
                <SidebarItem href={`${base}/phase1`} label="Final Report + CRO Prompts" icon="○" muted active={false} />
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border-emphasis space-y-1">
        <Link
          href="/corpus"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-heading hover:bg-nav-item-hover transition-colors"
        >
          <span className="text-[10px] w-3 text-center flex-shrink-0">◈</span>
          <span>Corpus</span>
        </Link>
        <Link
          href="/runs"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-heading hover:bg-nav-item-hover transition-colors"
        >
          <span className="text-[10px] w-3 text-center flex-shrink-0">≡</span>
          <span>Analysis History</span>
        </Link>
        <div className="pt-2 mt-1 border-t border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <p className="text-nav-item-muted text-[10px]">HIPAA · SOC 2</p>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-nav-item-muted hover:text-text-muted text-[10px] transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
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
          ? 'bg-nav-item-active-bg text-nav-item-active-text font-semibold'
          : muted
          ? 'text-nav-item-muted cursor-default pointer-events-none'
          : 'text-text-secondary hover:text-text-heading hover:bg-nav-item-hover'
      }`}
    >
      <span className="text-[10px] w-3 text-center flex-shrink-0">{icon}</span>
      <span className="flex-1 leading-tight">{label}</span>
      {badge && (
        <span className="text-[9px] font-bold bg-brand-tint text-brand-core px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </Link>
  );
}
