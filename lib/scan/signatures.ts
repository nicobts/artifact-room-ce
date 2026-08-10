/**
 * Known-bad substring signatures consulted by the scanner. MVP default is a
 * tiny illustrative set; the `abuse-takedown` change makes this list
 * DB-managed/editable without a redeploy (so the heuristic layer can be
 * tightened operationally). `extra` lets callers append the managed list.
 */
const DEFAULT_SIGNATURES: readonly string[] = [
  // Illustrative placeholder for a known phishing-kit marker.
  "__ARTIFACT_ROOM_KNOWN_BAD_SIGNATURE__",
];

export function getSignatures(extra: readonly string[] = []): string[] {
  return [...DEFAULT_SIGNATURES, ...extra];
}

/** Returns the first matching signature, or null. */
export function matchSignature(
  html: string,
  signatures: readonly string[],
): string | null {
  for (const s of signatures) if (s && html.includes(s)) return s;
  return null;
}
