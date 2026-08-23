import { describe, expect, it } from "vitest";
import { recoveryErrorFromLocation, validateRecoveryPassword } from "@/lib/supabase/passwordRecovery";

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
});
