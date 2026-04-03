export const dynamic = "force-dynamic";

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [email, setEmail] = useState("bob@headlamp.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  const supabase = createClient();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/");
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
    setLoading(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0A1628] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#4F8EF7] flex items-center justify-center text-white font-bold text-lg">L</div>
          <span className="text-[#F0F4FF] font-semibold text-xl tracking-tight">Lumos <span className="text-[#4F8EF7]">AI</span></span>
        </div>

        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-8">
          {resetSent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="text-[#F0F4FF] font-semibold text-lg mb-2">Check your email</h2>
              <p className="text-[#8BA3C7] text-sm">We sent a password reset link to <strong className="text-[#F0F4FF]">{email}</strong>. Click it to set your password, then come back to sign in.</p>
              <button onClick={() => { setResetSent(false); setMode("login"); }} className="mt-4 text-[#4F8EF7] text-sm hover:underline">Back to sign in</button>
            </div>
          ) : mode === "login" ? (
            <>
              <h2 className="text-[#F0F4FF] font-semibold text-xl mb-1">Sign in</h2>
              <p className="text-[#8BA3C7] text-sm mb-6">Enter your credentials to continue.</p>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#8BA3C7] mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-4 py-2.5 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors" />
                </div>
                <div>
                  <label className="block text-sm text-[#8BA3C7] mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-4 py-2.5 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors" />
                </div>
                {error && <p className="text-[#EF4444] text-sm">{error}</p>}
                <button type="submit" disabled={loading || !email || !password}
                  className="w-full bg-[#4F8EF7] hover:bg-[#3A7AE4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                  {loading ? "Signing in…" : "Sign in"}
                </button>
                <button type="button" onClick={() => { setMode("reset"); setError(null); }}
                  className="w-full text-[#8BA3C7] hover:text-[#4F8EF7] text-sm transition-colors text-center">
                  Forgot password / set password
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-[#F0F4FF] font-semibold text-xl mb-1">Set password</h2>
              <p className="text-[#8BA3C7] text-sm mb-6">We&apos;ll email you a link to set your password.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#8BA3C7] mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-4 py-2.5 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors" />
                </div>
                {error && <p className="text-[#EF4444] text-sm">{error}</p>}
                <button type="submit" disabled={loading || !email}
                  className="w-full bg-[#4F8EF7] hover:bg-[#3A7AE4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                  {loading ? "Sending…" : "Send reset link"}
                </button>
                <button type="button" onClick={() => { setMode("login"); setError(null); }}
                  className="w-full text-[#8BA3C7] hover:text-[#4F8EF7] text-sm transition-colors text-center">
                  Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[#8BA3C7] text-xs mt-6">Lumos AI · Patient Phenotyping</p>
      </div>
    </div>
  );
}
