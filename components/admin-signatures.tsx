"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SignatureRow {
  id: string;
  pattern: string;
  note: string | null;
}

export function AdminSignatures({ signatures }: { signatures: SignatureRow[] }) {
  const router = useRouter();
  const [pattern, setPattern] = useState("");
  const [loading, setLoading] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pattern.trim()) return;
    setLoading(true);
    const res = await fetch("/api/creator/admin/signatures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pattern }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Could not add the signature.");
      return;
    }
    setPattern("");
    toast.success("Signature added — effective on the next upload.");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/creator/admin/signatures/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Could not remove.");
      return;
    }
    toast.success("Signature removed.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Known-bad signatures</CardTitle>
        <CardDescription>
          Substrings the upload scanner rejects. Effective immediately — no
          redeploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={add} className="flex gap-2">
          <Input
            placeholder="signature substring"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
          <Button type="submit" disabled={loading}>
            Add
          </Button>
        </form>
        {signatures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signatures yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {signatures.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <code className="flex-1 truncate text-xs">{s.pattern}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove signature"
                  onClick={() => remove(s.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
