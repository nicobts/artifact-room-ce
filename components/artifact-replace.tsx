"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * In-place HTML replacement for an existing artifact (artifact-versioning).
 * Reuses the uploader UX (drop/paste) but posts to the per-artifact reupload
 * endpoint. The artifact's shares/tokens/analytics are preserved — existing
 * links keep working and serve the new bytes after a successful, scanned-clean
 * replacement. Scan rejections surface their reason just like the initial
 * upload.
 */
export function ArtifactReplace({
  artifactId,
  version,
}: {
  artifactId: string;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    // Zips are kept binary and sent as multipart; HTML is read into the textarea.
    if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
      setZipFile(file);
      setHtml("");
      return;
    }
    if (!/\.html?$/i.test(file.name) && !file.type.includes("html")) {
      toast.error("Please drop an .html file or a .zip bundle.");
      return;
    }
    setZipFile(null);
    setHtml(await file.text());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!zipFile && !html.trim()) {
      toast.error("Paste or drop the replacement HTML or .zip bundle first.");
      return;
    }
    setLoading(true);
    let res: Response;
    if (zipFile) {
      const form = new FormData();
      form.set("file", zipFile);
      res = await fetch(`/api/creator/artifacts/${artifactId}/reupload`, {
        method: "POST",
        body: form,
      });
    } else {
      res = await fetch(`/api/creator/artifacts/${artifactId}/reupload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html }),
      });
    }
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      // 422 = scan rejection (reason + rule); nothing was stored.
      toast.error(data.error ?? "Replacement failed.", {
        description: data.rule ? `Rejected: ${data.rule}` : undefined,
      });
      return;
    }
    const notes =
      Array.isArray(data.advisories) && data.advisories.length > 0
        ? ` (notes: ${data.advisories.join(", ")})`
        : "";
    toast.success(`Replaced — now version ${data.version}.${notes}`);
    setHtml("");
    setZipFile(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Replace HTML
      </Button>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">
          Replace HTML
        </CardTitle>
        <CardDescription>
          Drop or paste new HTML to replace this artifact in place. Currently
          version {version}. Shares, links, and analytics are kept; the new
          content is scanned before it is stored. If the slide count changes,
          historical per-slide dwell may not line up with the new slides.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
            className={cn(
              "rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors",
              dragging && "border-primary bg-accent text-accent-foreground",
            )}
          >
            {zipFile ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-medium text-foreground">{zipFile.name}</span>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setZipFile(null)}
                >
                  remove
                </button>
              </span>
            ) : (
              <>Drag &amp; drop an .html file or .zip bundle here, or paste the HTML below.</>
            )}
            {/*
              Same reasoning as the uploader: a .zip bundle has no paste
              equivalent, so drag-and-drop alone would leave keyboard and
              screen-reader users unable to replace an artifact with one.
            */}
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.zip,text/html,application/zip"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose a file
              </Button>
            </div>
          </div>
          <textarea
            value={html}
            onChange={(e) => {
              setHtml(e.target.value);
              if (e.target.value.trim()) setZipFile(null);
            }}
            placeholder="<!doctype html> …"
            spellCheck={false}
            className="min-h-48 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setHtml("");
                setZipFile(null);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Replacing…" : "Replace & rescan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
