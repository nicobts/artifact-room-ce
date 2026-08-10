/**
 * Sign-up gating (`SIGNUP_MODE`). Pure + env-injectable so it is unit-testable.
 *
 * Since upload is account-gated, who may register IS the abuse
 * lever. `invite` restricts registration to an allowlist of emails.
 */
export type SignupMode = "open" | "invite";

export function getSignupMode(
  env: Record<string, string | undefined> = process.env,
): SignupMode {
  // Secure-by-default: registration is invite-only unless the operator
  // explicitly opts into open signup. Unknown values fail safe to invite.
  return env.SIGNUP_MODE === "open" ? "open" : "invite";
}

export function isSignupAllowed(
  email: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (getSignupMode(env) === "open") return true;
  const allowlist = (env.SIGNUP_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}
