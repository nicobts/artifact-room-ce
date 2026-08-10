"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDownIcon, CopyIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HTML_SNIPPET = `<section data-ar-section data-ar-label="Pricing">…</section>`;
const AI_PROMPT_SNIPPET = `Wrap each logical section of the page in <section data-ar-section data-ar-label="Short section name"> so engagement analytics can track it.`;

const HASH = "#improve-tracking";

function CopyBlock({ label, code }: { label: string; code: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          <CopyIcon className="size-3.5" />
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
        {code}
      </pre>
    </div>
  );
}

export function TrackingGuidance() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function syncWithHash() {
      if (window.location.hash === HASH) setExpanded(true);
    }
    syncWithHash();
    window.addEventListener("hashchange", syncWithHash);
    return () => window.removeEventListener("hashchange", syncWithHash);
  }, []);

  return (
    <Card id="improve-tracking" size="sm">
      <CardHeader>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle>Improve your tracking</CardTitle>
          <ChevronDownIcon
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <ul className="flex flex-col gap-1.5">
            <li>
              Slides are auto-detected via `data-slide` attributes, reveal.js
              decks, or top-level `&lt;section&gt;` elements.
            </li>
            <li>
              Explicit sections via `data-ar-section` (optionally
              `data-ar-label`) give the richest, named breakdown.
            </li>
            <li>
              Otherwise, engagement falls back to scroll depth tracked in
              quartiles.
            </li>
          </ul>
          <div className="flex flex-col gap-3">
            <CopyBlock label="HTML" code={HTML_SNIPPET} />
            <CopyBlock label="AI prompt" code={AI_PROMPT_SNIPPET} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
