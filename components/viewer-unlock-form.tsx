"use client";

import { useState } from "react";

/**
 * Minimal unlock gate on the viewer origin. No shadcn weight, no branding.
 *
 * Renders exactly the factors the share requires. There is ONE error message
 * for every failure: telling the viewer whether the address or the password was
 * wrong — or that they were throttled — would turn this form into an oracle for
 * which addresses are registered against a share.
 */
export function ViewerUnlockForm({
  token,
  needsEmail,
  needsPassword,
}: {
  token: string;
  needsEmail: boolean;
  needsPassword: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const heading =
    needsEmail && needsPassword
      ? "Email and password required"
      : needsEmail
        ? "Email required"
        : "Password required";

  const blurb =
    needsEmail && needsPassword
      ? "Enter the email address this was sent to, and the password."
      : needsEmail
        ? "Enter the email address this was sent to."
        : "Enter the password to view this artifact.";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/public/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        ...(needsEmail ? { email } : {}),
        ...(needsPassword ? { password } : {}),
      }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.reload();
      return;
    }
    // Deliberately identical for every cause.
    setError("That didn’t work. Check the details and try again.");
  }

  const inputClass =
    "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  return (
    <main className="grid min-h-dvh place-items-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-medium">{heading}</h1>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>

        {needsEmail && (
          <div className="space-y-1">
            <label htmlFor="unlock-email" className="text-sm">
              Email
            </label>
            <input
              id="unlock-email"
              type="email"
              value={email}
              autoFocus
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {needsPassword && (
          <div className="space-y-1">
            <label htmlFor="unlock-password" className="text-sm">
              Password
            </label>
            <input
              id="unlock-password"
              type="password"
              value={password}
              autoFocus={!needsEmail}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
