import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_RECOVERY_PASSWORD_LENGTH = 12;
export const MAX_RECOVERY_PASSWORD_LENGTH = 128;
export const RECOVERY_AUTHORIZATION_ENDPOINT = "/api/auth/reset-password/authorize";

const MAX_RECOVERY_ACCESS_TOKEN_LENGTH = 8_000;

type RecoveryAuthorizationResult = { authorized?: unknown };
type RecoveryAuthorizer = (accessToken: string) => Promise<boolean>;

export async function authorizeRecoveryAccessToken(
  accessToken: string,
  request: typeof fetch = fetch
): Promise<boolean> {
  if (
    !accessToken
    || accessToken.length > MAX_RECOVERY_ACCESS_TOKEN_LENGTH
    || /\s/.test(accessToken)
  ) return false;

  try {
    const response = await request(RECOVERY_AUTHORIZATION_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    const result = await response.json() as RecoveryAuthorizationResult;
    return response.ok && result.authorized === true;
  } catch {
    return false;
  }
}

export async function authorizeRecoverySession(
  client: SupabaseClient,
  accessToken: string | undefined,
  authorize: RecoveryAuthorizer = authorizeRecoveryAccessToken
): Promise<boolean> {
  if (accessToken && await authorize(accessToken)) return true;
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return false;
}

export async function completeRecoveryPasswordUpdate(
  client: SupabaseClient,
  password: string,
  authorize: RecoveryAuthorizer = authorizeRecoveryAccessToken
): Promise<void> {
  const { data, error: sessionError } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (sessionError || !accessToken || !(await authorize(accessToken))) {
    throw new Error("RECOVERY_NOT_AUTHORIZED");
  }

  const { error: updateError } = await client.auth.updateUser({ password });
  if (updateError) throw new Error("RECOVERY_UPDATE_FAILED");
  await client.auth.signOut({ scope: "global" }).catch(() => undefined);
}

export function recoveryErrorFromLocation(hash: string, search: string): string | null {
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const code = fragment.get("error_code") || query.get("error_code");
  if (!code) return null;
  if (code === "otp_expired") return "This recovery link is invalid or has expired. Request one new reset email and use its newest link.";
  return "This recovery link could not be verified. Request a new reset email and try again.";
}

export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_RECOVERY_PASSWORD_LENGTH) {
    return `Use at least ${MIN_RECOVERY_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_RECOVERY_PASSWORD_LENGTH) {
    return `Use no more than ${MAX_RECOVERY_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
