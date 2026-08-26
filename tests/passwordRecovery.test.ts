import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  authorizeRecoveryAccessToken,
  authorizeRecoverySession,
  completeRecoveryPasswordUpdate,
  RECOVERY_AUTHORIZATION_ENDPOINT,
  recoveryErrorFromLocation,
  validateRecoveryPassword,
} from "@/lib/supabase/passwordRecovery";

function recoveryClient(accessToken: string | null = "current-recovery-token") {
  const getSession = vi.fn(async () => ({
    data: { session: accessToken ? { access_token: accessToken } : null },
    error: null,
  }));
  const updateUser = vi.fn(async (_attributes: { password: string }): Promise<{ error: Error | null }> => ({ error: null }));
  const signOut = vi.fn(async (_options: { scope: "local" | "global" }): Promise<{ error: Error | null }> => ({ error: null }));
  const client = { auth: { getSession, updateUser, signOut } } as unknown as SupabaseClient;
  return { client, getSession, updateUser, signOut };
}

describe("Supabase password recovery", () => {
  it("turns expired-link fragments into a safe message without reflecting provider text", () => {
    expect(recoveryErrorFromLocation("#error=access_denied&error_code=otp_expired&error_description=<script>", ""))
      .toBe("This recovery link is invalid or has expired. Request one new reset email and use its newest link.");
  });

  it("accepts only matching passwords between 12 and 128 characters", () => {
    expect(validateRecoveryPassword("short", "short")).toBe("Use at least 12 characters.");
    expect(validateRecoveryPassword("a".repeat(129), "a".repeat(129))).toBe("Use no more than 128 characters.");
    expect(validateRecoveryPassword("correct horse", "correct house")).toBe("The passwords do not match.");
    expect(validateRecoveryPassword("correct horse", "correct horse")).toBeNull();
  });

  it("sends only the recovery token as a bounded same-origin Bearer credential", async () => {
    const token = "header.payload.signature";
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ authorized: true }));

    await expect(authorizeRecoveryAccessToken(token, request as typeof fetch)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(RECOVERY_AUTHORIZATION_ENDPOINT);
    expect(url).not.toContain(token);
    expect(init).toEqual({
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    expect(init).not.toHaveProperty("body");
  });

  it("fails closed before a request for malformed or oversized access tokens", async () => {
    const request = vi.fn();
    await expect(authorizeRecoveryAccessToken("token with spaces", request as typeof fetch)).resolves.toBe(false);
    await expect(authorizeRecoveryAccessToken("a".repeat(8_001), request as typeof fetch)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("requires server authorization before accepting a recovery session", async () => {
    const authorizedClient = recoveryClient();
    const authorize = vi.fn(async () => true);
    await expect(authorizeRecoverySession(authorizedClient.client, "recovery-token", authorize)).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith("recovery-token");
    expect(authorizedClient.signOut).not.toHaveBeenCalled();

    const deniedClient = recoveryClient();
    await expect(authorizeRecoverySession(deniedClient.client, "recovery-token", async () => false)).resolves.toBe(false);
    expect(deniedClient.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reauthorizes the current session immediately before updating its password", async () => {
    const order: string[] = [];
    const { client, getSession, updateUser, signOut } = recoveryClient("current-session-token");
    getSession.mockImplementation(async () => {
      order.push("session");
      return { data: { session: { access_token: "current-session-token" } }, error: null };
    });
    const authorize = vi.fn(async () => {
      order.push("authorize");
      return true;
    });
    updateUser.mockImplementation(async () => {
      order.push("update");
      return { error: null };
    });
    signOut.mockImplementation(async () => {
      order.push("signout");
      return { error: null };
    });

    await completeRecoveryPasswordUpdate(client, "a secure new password", authorize);
    expect(order).toEqual(["session", "authorize", "update", "signout"]);
    expect(authorize).toHaveBeenCalledWith("current-session-token");
    expect(updateUser).toHaveBeenCalledWith({ password: "a secure new password" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("performs no password mutation without a current authorized recovery session", async () => {
    const missing = recoveryClient(null);
    const authorizeMissing = vi.fn(async () => true);
    await expect(completeRecoveryPasswordUpdate(missing.client, "new password", authorizeMissing))
      .rejects.toThrow("RECOVERY_NOT_AUTHORIZED");
    expect(authorizeMissing).not.toHaveBeenCalled();
    expect(missing.updateUser).not.toHaveBeenCalled();

    const denied = recoveryClient("sensitive-recovery-token");
    await expect(completeRecoveryPasswordUpdate(denied.client, "new password", async () => false))
      .rejects.toThrow("RECOVERY_NOT_AUTHORIZED");
    expect(denied.updateUser).not.toHaveBeenCalled();
  });

  it("keeps provider failures generic and never includes the access token in errors", async () => {
    const token = "sensitive-recovery-token";
    const deniedRequest = vi.fn(async () => Response.json({ authorized: false }, { status: 401 }));
    await expect(authorizeRecoveryAccessToken(token, deniedRequest as typeof fetch)).resolves.toBe(false);

    const { client, updateUser } = recoveryClient(token);
    updateUser.mockResolvedValue({ error: new Error(`provider error mentioning ${token}`) });
    let message = "";
    try {
      await completeRecoveryPasswordUpdate(client, "new password", async () => true);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("RECOVERY_UPDATE_FAILED");
    expect(message).not.toContain(token);
  });

  it("preserves path-only URL cleanup and generic recovery UI behavior", () => {
    const form = fs.readFileSync(path.join(process.cwd(), "src/app/auth/reset-password/ResetPasswordForm.tsx"), "utf8");
    const helper = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/passwordRecovery.ts"), "utf8");
    expect(form).toContain("window.history.replaceState({}, document.title, window.location.pathname)");
    expect(form).toContain("authorizeRecoverySession(client, accessToken, authorizeRecoveryAccessToken)");
    expect(form).toContain("completeRecoveryPasswordUpdate(client, password)");
    expect(helper).toContain('scope: "local"');
    expect(helper).toContain('scope: "global"');
    expect(form).toContain("The password could not be updated.");
  });
});
