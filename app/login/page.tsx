"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError("Incorrect password. Check with the Headlamp team.");
        setLoading(false);
        return;
      }

      router.push(data.redirect ?? "/");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="mb-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand-core flex items-center justify-center font-bold text-white text-base">
            L
          </div>
          <div>
            <div className="text-text-heading font-semibold text-sm">Lumos AI™</div>
            <div className="text-brand-core text-[10px] uppercase tracking-widest">Headlamp Health</div>
          </div>
        </div>

        <h1 className="text-xl font-bold text-text-heading mb-1">Private Preview</h1>
        <p className="text-text-muted text-sm">
          Enter the access password shared by the Headlamp team.
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-text-muted text-xs uppercase tracking-widest mb-2">
          Access Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          autoFocus
          required
          className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl text-text-heading placeholder-nav-item-muted text-sm focus:outline-none focus:border-brand-core transition-colors"
        />
      </div>

      {error && (
        <p className="text-status-danger text-xs mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !password}
        className="w-full py-3 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Checking…" : "Enter"}
      </button>

      <p className="text-center text-text-secondary text-xs mt-6">
        Need access? Contact the Headlamp team.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
