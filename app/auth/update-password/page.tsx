"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/");
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-core flex items-center justify-center text-white font-bold text-lg">L</div>
          <span className="text-text-heading font-semibold text-xl tracking-tight">Lumos <span className="text-brand-core">AI</span></span>
        </div>

        <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8">
          <h2 className="text-text-heading font-semibold text-xl mb-1">Set your password</h2>
          <p className="text-text-muted text-sm mb-6">Choose a password for your account.</p>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters" required minLength={8}
                className="w-full bg-bg-page border border-border-subtle rounded-lg px-4 py-2.5 text-text-heading text-sm placeholder-text-muted focus:outline-none focus:border-brand-core transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" required
                className="w-full bg-bg-page border border-border-subtle rounded-lg px-4 py-2.5 text-text-heading text-sm placeholder-text-muted focus:outline-none focus:border-brand-core transition-colors" />
            </div>
            {error && <p className="text-status-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading || !password || !confirm}
              className="w-full bg-brand-core hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? "Saving…" : "Set password & sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
