export interface SafeBrowsingResult {
  /** URLs that matched a threat. */
  flagged: string[];
  /** Whether the lookup actually ran (false = no key, no URLs, or API error). */
  checked: boolean;
}

/**
 * Google Safe Browsing v4 lookup over a document's outbound URLs.
 *
 * Threat matches => those URLs are flagged (the caller rejects the upload).
 * Note on fail-open: a network/API error returns `checked: false` rather than
 * rejecting, so uploads don't hard-depend on Google's uptime — the local
 * heuristics and the render-time sandbox still apply. Without a key it is a
 * no-op (so dev/CI are deterministic and offline).
 */
export async function checkSafeBrowsing(
  urls: string[],
  apiKey: string | undefined = process.env.SAFE_BROWSING_API_KEY,
): Promise<SafeBrowsingResult> {
  if (!apiKey || urls.length === 0) return { flagged: [], checked: false };

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "artifact-room", clientVersion: "0.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.slice(0, 500).map((url) => ({ url })),
          },
        }),
      },
    );
    if (!res.ok) return { flagged: [], checked: false };
    const data = (await res.json()) as {
      matches?: { threat?: { url?: string } }[];
    };
    const flagged = (data.matches ?? [])
      .map((m) => m.threat?.url)
      .filter((u): u is string => Boolean(u));
    return { flagged, checked: true };
  } catch {
    return { flagged: [], checked: false };
  }
}
