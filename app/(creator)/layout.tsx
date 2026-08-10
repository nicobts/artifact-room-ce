import { requireCreator } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Creator route group — the BetterAuth (creator) identity system.
 *
 * SECURITY SPINE: this server-side guard runs for every page in the group.
 * No session -> redirect to /login. Auth pages live in the `(auth)` group, so
 * they are not affected by this guard (no redirect loop). Nothing under
 * `app/(viewer)` may import from this group.
 *
 * The console shell (sidebar + header) lives here so every page renders inside
 * it without repeating the boilerplate, and `isAdmin` is resolved once.
 */
export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCreator();
  const user = {
    name: session.user.name ?? "Creator",
    email: session.user.email ?? "",
    avatar: session.user.image ?? undefined,
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} isAdmin={isAdmin(session.user)} />
      <SidebarInset className="bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklch,var(--ember)_7%,var(--background))_0%,var(--background)_45%)]">
        <SiteHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
