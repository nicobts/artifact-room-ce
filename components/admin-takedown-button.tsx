"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AdminTakedownButton({
  reportId,
  token,
}: {
  reportId: string;
  token: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!token) {
      toast.error("This report has no link to take down.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/creator/admin/takedown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, reportId }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Takedown failed.");
      return;
    }
    const data = await res.json();
    toast.success(`Taken down — ${data.revokedShares} share(s) revoked.`);
    router.refresh();
  }

  return (
    <Button size="sm" variant="destructive" onClick={onClick} disabled={loading}>
      {loading ? "…" : "Take down"}
    </Button>
  );
}
