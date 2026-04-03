export const dynamic = "force-dynamic";

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
    <div className="flex-1 flex items-center justify-center bg-[#0A1628] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#4F8EF7] flex items-center justify-center text-white font-bold text-lg">L</div>
          <span className="text-[#F0F4FF] font-semibold text-xl tracking-tight">Lumos <span className="text-[#4F8EF7]">AI</span></span>
        </div>

        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-8">
          <h2 className="text-[#F0F4FF] font-semibold text-xl mb-1">Set your password</h2>
          <p className="text-[#8BA3C7] text-sm mb-6">Choose a password for your account.</p>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm text-[#8BA3C7] mb-1.5">New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters" required minLength={8}
                className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-4 py-2.5 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-[#8BA3C7] mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" required
                className="w-full bg-[#0A1628] border border-[#1E3A5F] rounded-lg px-4 py-2.5 text-[#F0F4FF] text-sm placeholder-[#8BA3C7] focus:outline-none focus:border-[#4F8EF7] transition-colors" />
            </div>
            {error && <p className="text-[#EF4444] text-sm">{error}</p>}
            <button type="submit" disabled={loading || !password || !confirm}
              className="w-full bg-[#4F8EF7] hover:bg-[#3A7AE4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? "Saving…" : "Set password & sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
