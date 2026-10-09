import type { Metadata } from "next";
import { PreferencesForm } from "@/features/settings/preferences-form";
import { RoleSwitcher } from "@/features/settings/role-switcher";
import { getConfig } from "@/server/config";
import { getPreferences } from "@/server/preferences";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

// Server Component: reads the role cookie and preferences directly; only the two forms are client components.
export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="grid gap-4" aria-labelledby="role-heading">
        <div>
          <h2 id="role-heading" className="text-lg font-medium">
            Role
          </h2>
          <p className="text-sm text-muted-foreground">
            There is no real sign-in: the role is stored in a cookie and checked by the server on every change.
          </p>
        </div>
        <RoleSwitcher role={user.role} />
      </section>

      <section className="grid gap-4" aria-labelledby="preferences-heading">
        <h2 id="preferences-heading" className="text-lg font-medium">
          Preferences
        </h2>
        <PreferencesForm defaultValues={getPreferences(user.id)} timezones={getConfig().timezones} />
      </section>
    </main>
  );
}
