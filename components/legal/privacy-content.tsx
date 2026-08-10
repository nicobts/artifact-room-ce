/*
  NOTE (maintainer): have this reviewed by an attorney before the instance
  is public-facing. Every claim below is grounded in documented application
  behavior (docs/05-security.md, docs/06-analytics.md) — keep it that way
  when the application changes. Remove this comment after legal review.
*/

export const PRIVACY_UPDATED = "July 28, 2026";

/**
 * Privacy Policy prose — single source of truth, rendered both on /privacy
 * and inside the auth-form dialog. Server-compatible: no client hooks.
 */
export function PrivacyContent() {
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      <p className="text-muted-foreground">Last updated: {PRIVACY_UPDATED}</p>

      <h2>1. Controller</h2>
      <p>
        The controller for personal data processed by this Artifact Room
        instance is Nicolas Bossi, Austria. Contact:{" "}
        <a href="mailto:legal@artifact-room.com">legal@artifact-room.com</a>.
        This policy covers this instance; other self-hosted instances of the
        open-source software have their own operators and policies.
      </p>

      <h2>2. What we store</h2>
      <p>If you have a creator account:</p>
      <ul>
        <li>your name, email address, and a hashed password;</li>
        <li>
          session records for keeping you signed in — without your IP address
          (IP tracking is disabled by design).
        </li>
      </ul>
      <p>If you view an artifact someone shared with you:</p>
      <ul>
        <li>
          engagement events tied to the share link — opens, slide views, time
          spent, and derived signals such as reopens or suspected forwarding;
        </li>
        <li>
          a random first-party identifier stored in your browser&rsquo;s local
          storage on the viewer origin, plus a hashed browser signature
          (user-agent and language) — never your raw IP address, which is used
          transiently for rate limiting only and not stored.
        </li>
      </ul>
      <p>
        Application logs automatically redact tokens, passwords, emails,
        cookies, and IP fields.
      </p>

      <h2>3. Why we process it (legal bases)</h2>
      <ul>
        <li>
          <strong>Contract</strong> (Art. 6(1)(b) GDPR): operating your
          account and serving the artifacts you share.
        </li>
        <li>
          <strong>Legitimate interest</strong> (Art. 6(1)(f)): showing
          creators how their shares are engaged with, and preventing abuse of
          the service (scanning, rate limiting, takedown).
        </li>
      </ul>

      <h2>4. How long we keep it</h2>
      <p>
        Engagement events live with the share they belong to: deleting an
        artifact or revoking a share removes what was collected for it.
        Account data is kept while your account exists and deleted when it is
        deleted. We do not run analytics beyond what is shown to the creator
        who shared with you.
      </p>

      <h2>5. Cookies and local storage</h2>
      <ul>
        <li>
          App origin: one essential session cookie for signing in (host-only,
          never shared with the viewer origin). If you untick &ldquo;Remember
          me&rdquo;, it expires when you close the browser.
        </li>
        <li>
          Viewer origin: no analytics cookies. A password-protected share sets
          one essential access cookie. The viewer identifier described above
          lives in local storage.
        </li>
        <li>No third-party cookies, trackers, or advertising — ever.</li>
      </ul>

      <h2>6. Optional integrations</h2>
      <p>
        By default this instance makes no requests to third parties. Two
        integrations exist that an operator may enable: Google Safe Browsing
        (checks outbound URLs found in uploaded artifacts against a threat
        list) and SMTP email delivery (open notifications a creator opts into).
        When enabled, only the minimum data needed for each purpose is shared.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Under the GDPR you can request access, correction, deletion,
        restriction, portability, and object to processing based on legitimate
        interest — write to{" "}
        <a href="mailto:legal@artifact-room.com">legal@artifact-room.com</a>.
        You can also complain to the Austrian Data Protection Authority
        (Datenschutzbehörde, dsb.gv.at).
      </p>

      <h2>8. Where data lives</h2>
      <p>
        This instance is self-hosted on a server in the European Union. No
        personal data is transferred outside the EU/EEA in normal operation.
      </p>

      <h2>9. Changes</h2>
      <p>
        We will announce material changes to this policy in the app. The
        &ldquo;last updated&rdquo; date above always reflects the current
        version.
      </p>
    </div>
  );
}
