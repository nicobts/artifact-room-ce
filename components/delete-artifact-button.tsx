"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteArtifactButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    setLoading(true);
    const res = await fetch(`/api/creator/artifacts/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      toast.error("Could not delete the artifact.");
      return;
    }
    toast.success("Artifact deleted.");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      disabled={loading}
      aria-label="Delete artifact"
    >
      <Trash2Icon className="size-4" />
    </Button>
  );
}
