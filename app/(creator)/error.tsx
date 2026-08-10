"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the server logs via Next's error pipeline.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page failed to load. Try again — if it keeps happening, check the
          server logs.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
