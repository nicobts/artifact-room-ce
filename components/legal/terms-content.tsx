/*
  NOTE (maintainer): have this reviewed by an attorney before the instance
  is public-facing. Drafted from the application's documented behavior.
  Remove this comment after legal review.
*/

export const TERMS_UPDATED = "July 28, 2026";

/**
 * Terms of Service prose — single source of truth, rendered both on /terms
 * and inside the auth-form dialog. Server-compatible: no client hooks.
 */
export function TermsContent() {
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      <p className="text-muted-foreground">Last updated: {TERMS_UPDATED}</p>

      <h2>1. Who we are, and what these terms cover</h2>
      <p>
        This Artifact Room instance is operated by Nicolas Bossi
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). These Terms govern your use of
        this instance. Artifact Room is also open-source software (AGPL-3.0):
        instances hosted by other operators are governed by those
        operators&rsquo; own terms, not these.
      </p>

      <h2>2. The service</h2>
      <p>
        Artifact Room lets you upload interactive HTML artifacts, share them
        through links you control, and see per-share engagement insights.
        Shared artifacts are rendered in a sandboxed viewer. The service is
        provided free of charge.
      </p>

      <h2>3. Your account</h2>
      <p>
        Registration may be invite-only. You are responsible for keeping your
        credentials confidential and for the activity that happens under your
        account. Provide accurate information and tell us at{" "}
        <a href="mailto:legal@artifact-room.com">legal@artifact-room.com</a> if
        you believe your account was compromised.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You may not use the service to host or distribute:</p>
      <ul>
        <li>malware, phishing pages, or content designed to deceive or harm;</li>
        <li>content that is unlawful in Austria or in your jurisdiction;</li>
        <li>content that infringes someone else&rsquo;s rights.</li>
      </ul>
      <p>
        Uploads are scanned, shares can be reported for abuse, and we may take
        down content and revoke shares or accounts that violate these rules —
        immediately where the violation is serious.
      </p>

      <h2>5. Your content</h2>
      <p>
        What you upload stays yours. You grant us only the limited license
        needed to operate the service: storing your artifacts and serving them
        to the people you share them with. Deleting an artifact ends that
        license for it.
      </p>

      <h2>6. Disclaimer and liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;, without warranties of any kind, to the extent
        permitted by law. We are liable without limitation for intent and
        gross negligence and under mandatory statutory liability; otherwise
        our liability for slight negligence is excluded. We are not liable for
        content uploaded by users.
      </p>

      <h2>7. Termination</h2>
      <p>
        You can stop using the service and delete your artifacts at any time.
        We may suspend or terminate accounts that violate these Terms, and may
        discontinue the service with reasonable advance notice.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms; material changes will be announced in the
        app before they take effect. Continuing to use the service after that
        means you accept the updated Terms.
      </p>

      <h2>9. Governing law and contact</h2>
      <p>
        These Terms are governed by Austrian law. Mandatory consumer
        protections of your country of residence remain unaffected. Contact:{" "}
        <a href="mailto:legal@artifact-room.com">legal@artifact-room.com</a>.
      </p>
    </div>
  );
}
