import { getCreatorSession } from "@/lib/session";
import { SettingsProfileForm } from "@/components/settings-profile-form";
import { SettingsPasswordForm } from "@/components/settings-password-form";

export default async function SettingsPage() {
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <div className="flex max-w-2xl flex-col gap-6">
        <SettingsProfileForm
          name={session.user.name ?? ""}
          email={session.user.email ?? ""}
        />
        <SettingsPasswordForm />
      </div>
    </div>
  );
}
