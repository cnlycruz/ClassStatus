import type { Metadata } from "next";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/runtimeConfig";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset Admin Password | Class Status",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  const config = getSupabaseRuntimeConfig();
  return <ResetPasswordForm supabaseUrl={config.url} supabasePublishableKey={config.publishableKey} />;
}
