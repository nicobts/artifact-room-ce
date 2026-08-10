import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/auth-schema";

/**
 * Admin user management (admin-role-column). CREATOR identity system only.
 * Writers of `user.role`: this module (admin UI) and db/promote-admins.ts
 * (boot bootstrap). The last-admin guard keeps an instance from stranding
 * itself with zero admins.
 */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};

export function listUsers(): AdminUserRow[] {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .all();
}

export function setUserRole(
  id: string,
  role: "admin" | "member",
): "ok" | "not-found" | "last-admin" {
  return db.transaction((tx) => {
    const target = tx
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, id))
      .get();
    if (!target) return "not-found";

    if (target.role === "admin" && role === "member") {
      const admins = tx
        .select({ n: count() })
        .from(user)
        .where(eq(user.role, "admin"))
        .get();
      if ((admins?.n ?? 0) <= 1) return "last-admin";
    }

    tx.update(user).set({ role }).where(eq(user.id, id)).run();
    return "ok";
  });
}
