"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setIsDark(stored === "dark");
  }, []);

  const toggle = () => {
    const next = !isDark;
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-text-secondary hover:text-text-heading hover:bg-nav-item-hover transition-colors text-xs font-medium"
    >
      {isDark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
