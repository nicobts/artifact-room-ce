"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * In-console artifact preview (artifact-preview). Mints a short-lived preview
 * URL on the viewer origin and embeds it in a cross-origin, sandboxed iframe
 * (`allow-scripts`, no `allow-same-origin` → opaque). The rendered content is
 * untrusted HTML served under the preview CSP; it cannot reach this page.
 */
export function ArtifactPreview({ artifactId }: { artifactId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/creator/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artifactId }),
        });
        if (!res.ok) throw new Error("mint failed");
        const data = (await res.json()) as { url: string };
        if (!cancelled) {
          setUrl(data.url);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifactId, nonce]);

  function refresh() {
    setUrl(null);
    setError(false);
    setLoading(true);
    setNonce((n) => n + 1);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold tracking-tight">
          Preview
        </CardTitle>
        <div className="flex gap-2">
          {url && !error && (
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border bg-muted">
          {url && !error ? (
            <iframe
              title="Artifact preview"
              src={url}
              sandbox="allow-scripts"
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading preview…" : "Preview unavailable."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
