"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/corpus", label: "Corpus" },
  { href: "/runs", label: "Analysis History" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const pathname = usePathname();

  if (pathname === "/auth") return null;
  if (pathname === "/login") return null;
  if (pathname.startsWith("/studies/")) return null;

  return (
    <header className="bg-bg-surface border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-core flex items-center justify-center text-text-inverse font-bold text-sm">
            L
          </div>
          <span className="text-text-heading font-semibold text-lg tracking-tight">
            Lumos <span className="text-brand-core">AI</span>
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
                    ? "bg-nav-item-active-bg text-nav-item-active-text"
                    : "text-text-muted hover:text-text-heading hover:bg-nav-item-hover"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
