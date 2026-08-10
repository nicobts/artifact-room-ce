/**
 * Single-team admin gate. Admin is a SERVER-SET role column on the user row
 * (`admin-role-column`): `ADMIN_EMAILS` is only a promote-only bootstrap read
 * at boot (db/promote-admins.ts), never an authorization input at request
 * time. Pure so it stays unit-testable; routes/pages combine it with
 * `getCreatorSession()` and pass `session.user`.
 */
export function isAdmin(
  user: { role?: string | null } | null | undefined,
): boolean {
  return user?.role === "admin";
}
