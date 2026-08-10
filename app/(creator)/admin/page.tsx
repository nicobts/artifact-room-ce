import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminTakedownButton } from "@/components/admin-takedown-button";
import { AdminSignatures } from "@/components/admin-signatures";
import { AdminUsers } from "@/components/admin-users";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listReports, listSignatures } from "@/lib/abuse";
import { listUsers } from "@/lib/users";

export default async function AdminPage() {
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards
  if (!isAdmin(session.user)) redirect("/dashboard");

  const reports = listReports();
  const signatures = listSignatures();
  const users = listUsers();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight">
        Abuse &amp; moderation
      </h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Reports</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports.</p>
        ) : (
          reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <Badge
                  variant={r.status === "pending" ? "secondary" : "outline"}
                >
                  {r.status}
                </Badge>
                <span className="text-sm">{r.reason}</span>
                {r.reportedToken && (
                  <code className="max-w-[14rem] truncate text-xs text-muted-foreground">
                    {r.reportedToken}
                  </code>
                )}
                <div className="ml-auto">
                  <AdminTakedownButton
                    reportId={r.id}
                    token={r.reportedToken}
                  />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AdminSignatures
        signatures={signatures.map((s) => ({
          id: s.id,
          pattern: s.pattern,
          note: s.note,
        }))}
      />

      <AdminUsers
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
        }))}
        selfId={session.user.id}
      />
    </div>
  );
}
