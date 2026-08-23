export const MIN_RECOVERY_PASSWORD_LENGTH = 12;
export const MAX_RECOVERY_PASSWORD_LENGTH = 128;

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
