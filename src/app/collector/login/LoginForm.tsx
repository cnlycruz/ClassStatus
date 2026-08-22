"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const challengeResponse = await fetch("/api/admin/auth/login-challenge", { cache: "no-store" });
      if (!challengeResponse.ok) throw new Error("Admin authentication is not configured.");
      const { challenge } = await challengeResponse.json();
      const response = await fetch("/api/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, challenge }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(response.status === 429 ? `Too many attempts. Try again in ${data.retryAfterSeconds || 30} seconds.` : "Sign-in failed. Check your credentials and try again."); }
      router.replace("/collector"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign-in is unavailable."); }
    finally { setBusy(false); setPassword(""); }
  }
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 flex items-start gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ShieldCheck className="h-6 w-6" /></div><div><h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">ClassStatus Admin</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Secure access to publishing and collector diagnostics.</p></div></div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={128} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          <button disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"><LockKeyhole className="h-4 w-4" />{busy ? "Signing in…" : "Sign in securely"}</button>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">This console is restricted to the ClassStatus administrator. Attempts are rate-limited and audited.</p>
      </div>
    </main>
  );
}
