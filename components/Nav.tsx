"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/corpus", label: "Corpus" },
  { href: "/runs/new", label: "New Run" },
  { href: "/runs", label: "All Runs" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const pathname = usePathname();

  // Don't show nav on auth page or study pages (they have their own sidebar)
  if (pathname === "/auth") return null;
  if (pathname.startsWith("/studies/")) return null;

  return (
    <header className="bg-[#0F1F3D] border-b border-[#1E3A5F]">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4F8EF7] flex items-center justify-center text-white font-bold text-sm">
            L
          </div>
          <span className="text-[#F0F4FF] font-semibold text-lg tracking-tight">
            Lumos <span className="text-[#4F8EF7]">AI</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#1E3A5F] text-[#4F8EF7]"
                    : "text-[#8BA3C7] hover:text-[#F0F4FF] hover:bg-[#1E3A5F]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Study badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8BA3C7] bg-[#1E3A5F] px-3 py-1 rounded-full border border-[#1E3A5F]">
            Patient Phenotyping
          </span>
        </div>
      </div>
    </header>
  );
}
