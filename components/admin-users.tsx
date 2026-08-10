"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export function AdminUsers({
  users,
  selfId,
}: {
  users: UserRow[];
  selfId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setRole(id: string, role: "admin" | "member") {
    if (
      role === "member" &&
      id === selfId &&
      !window.confirm("Demote yourself? You will lose access to /admin.")
    ) {
      return;
    }
    setBusy(id);
    const res = await fetch(`/api/creator/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(null);
    if (res.status === 409) {
      toast.error("Cannot demote the last admin.");
      return;
    }
    if (!res.ok) {
      toast.error("Could not change the role.");
      return;
    }
    toast.success(role === "admin" ? "Promoted to admin." : "Demoted to member.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Admin is a server-set role. ADMIN_EMAILS only bootstraps at boot —
          manage roles here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{u.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {u.email}
                </span>
              </div>
              <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                {u.role}
              </Badge>
              {u.role === "admin" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === u.id}
                  onClick={() => setRole(u.id, "member")}
                >
                  Demote
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === u.id}
                  onClick={() => setRole(u.id, "admin")}
                >
                  Promote
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
