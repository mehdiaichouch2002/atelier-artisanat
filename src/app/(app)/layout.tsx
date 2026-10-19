import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getSettings } from "@/domain/settings/service";
import { AppShell } from "@/components/app-shell";
import { logoutAction } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await withUser(user.id, (tx) => getSettings(tx));
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role }} workshopName={settings.workshopName} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
