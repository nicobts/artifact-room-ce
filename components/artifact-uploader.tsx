"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ArtifactUploader() {
  const router = useRouter();
  const [title, setTitle] = useState("");
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
      setTitle((t) => t || file.name.replace(/\.zip$/i, ""));
      return;
    }
    if (!/\.html?$/i.test(file.name) && !file.type.includes("html")) {
      toast.error("Please drop an .html file or a .zip bundle.");
      return;
    }
    setZipFile(null);
    setHtml(await file.text());
    setTitle((t) => t || file.name.replace(/\.html?$/i, ""));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!zipFile && !html.trim()) {
      toast.error("Paste HTML, or drop an .html file or .zip bundle first.");
      return;
    }
    setLoading(true);
    let res: Response;
    if (zipFile) {
      const form = new FormData();
      form.set("title", title || "Untitled artifact");
      form.set("file", zipFile);
      res = await fetch("/api/creator/upload", { method: "POST", body: form });
    } else {
      res = await fetch("/api/creator/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || "Untitled artifact", html }),
      });
    }
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(data.error ?? "Upload failed.");
      return;
    }
    if (Array.isArray(data.advisories) && data.advisories.length > 0) {
      toast.warning(`Uploaded with notes: ${data.advisories.join(", ")}`);
    } else {
      toast.success("Artifact uploaded.");
    }
    setTitle("");
    setHtml("");
    setZipFile(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload an artifact</CardTitle>
        <CardDescription>
          Paste a complete single-file HTML document, drop an .html file, or drop
          a .zip bundle (one HTML file plus an assets/ folder — assets are inlined
          at upload). Every upload is scanned before it is stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
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
              Drag-and-drop cannot be the only way in: a .zip bundle has no
              paste equivalent, so without this control a keyboard or
              screen-reader user could not upload one at all. The input stays
              in the accessibility tree but out of the tab order; the button is
              the single labelled stop that opens the picker.
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
                  // Allow re-picking the same file: without this, choosing an
                  // identical filename twice fires no change event.
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
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
