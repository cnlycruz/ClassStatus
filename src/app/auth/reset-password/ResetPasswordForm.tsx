"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recoveryErrorFromLocation, validateRecoveryPassword } from "@/lib/supabase/passwordRecovery";

interface ResetPasswordFormProps {
  adminUserId: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

type RecoveryState = "checking" | "ready" | "invalid" | "complete";

function clearRecoveryParameters(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export function ResetPasswordForm({ adminUserId, supabaseUrl, supabasePublishableKey }: ResetPasswordFormProps) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Verifying your one-time recovery link…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const locationError = recoveryErrorFromLocation(window.location.hash, window.location.search);
    if (locationError) {
      clearRecoveryParameters();
      setMessage(locationError);
      setState("invalid");
      return;
    }

    const client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: true,
        persistSession: false,
      },
    });
    clientRef.current = client;
    let active = true;
    let accepted = false;

    const acceptSession = async (userId?: string) => {
      if (!active) return;
      accepted = true;
      clearRecoveryParameters();
      if (userId !== adminUserId) {
        await client.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (!active) return;
        setMessage("This recovery link is not authorized for the ClassStatus administrator.");
        setState("invalid");
        return;
      }
      setMessage("Recovery link verified. Choose a new administrator password.");
      setState("ready");
    };

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") void acceptSession(session?.user.id);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active || accepted) return;
      if (!error && data.session) void acceptSession(data.session.user.id);
      else {
        clearRecoveryParameters();
        setMessage("This recovery link is invalid or has expired. Request one new reset email and use its newest link.");
        setState("invalid");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      clientRef.current = null;
    };
  }, [adminUserId, supabasePublishableKey, supabaseUrl]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateRecoveryPassword(password, confirmation);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const client = clientRef.current;
    if (!client || state !== "ready") {
      setMessage("The recovery session is unavailable. Request a new reset email.");
      setState("invalid");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || userData.user?.id !== adminUserId) throw new Error("RECOVERY_NOT_AUTHORIZED");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut({ scope: "global" }).catch(() => undefined);
      setPassword("");
      setConfirmation("");
      setMessage("Password updated. Your recovery session has been revoked; you can now sign in securely.");
      setState("complete");
    } catch {
      setMessage("The password could not be updated. The recovery link may have expired; request one new email and try again.");
      setState("invalid");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ShieldCheck className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">Reset admin password</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Supabase verifies the one-time recovery link before allowing a change.</p></div>
        </div>

        {state === "ready" ? (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} maxLength={128} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            {message ? <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{message}</p> : null}
            <button disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"><KeyRound className="h-4 w-4" />{busy ? "Updating…" : "Update password"}</button>
          </form>
        ) : (
          <div className="space-y-4">
            <p role={state === "invalid" ? "alert" : "status"} className={`rounded-xl border px-3 py-2.5 text-sm ${state === "invalid" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"}`}>{message}</p>
            {state === "complete" ? <a href="/collector/login" className="flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700">Go to admin sign in</a> : null}
          </div>
        )}
      </div>
    </main>
  );
}
