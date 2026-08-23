import type { Metadata } from "next";
import { getConfiguredAdminUserId } from "@/lib/admin/config";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/runtimeConfig";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset Admin Password | ClassStatus",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  const config = getSupabaseRuntimeConfig();
  return <ResetPasswordForm adminUserId={getConfiguredAdminUserId()} supabaseUrl={config.url} supabasePublishableKey={config.publishableKey} />;
}
