"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareRowActions({
  shareId,
  url,
  revoked,
}: {
  shareId: string;
  url: string;
  revoked: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function revoke() {
    setLoading(true);
    const res = await fetch(`/api/creator/shares/${shareId}/revoke`, {
      method: "POST",
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Could not revoke the share.");
      return;
    }
    toast.success("Share revoked.");
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy link">
        <CopyIcon className="size-4" />
      </Button>
      {!revoked && (
        <Button
          variant="ghost"
          size="icon"
          onClick={revoke}
          disabled={loading}
          aria-label="Revoke share"
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </div>
  );
}
