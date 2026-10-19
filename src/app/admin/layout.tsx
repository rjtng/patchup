import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshButton } from "@/components/ui/refresh-button";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminTabs } from "./admin-tabs";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · PatchUp" } };

// The admin section: for the people who run PatchUp. Signed-out visitors are
// sent to Log in by the proxy; signed-in people who aren't admins see a
// notice instead (and the database refuses them anyway).
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col pb-10">
      <Suspense
        fallback={
          <>
            <AdminHeader />
            <CardsSkeleton count={4} />
          </>
        }
      >
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </div>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  if (!(await isAdmin(await createClient()))) {
    return (
      <>
        <PageHeader title="Admin" backHref="/profile" />
        <EmptyState icon={ShieldAlert} title="For PatchUp admins only">
          This part of PatchUp is for the team that runs it.
        </EmptyState>
        <div className="px-6">
          <ButtonLink href="/profile" variant="secondary">
            Back to your profile
          </ButtonLink>
        </div>
      </>
    );
  }
  return (
    <>
      <AdminHeader bell />
      {children}
    </>
  );
}

// With the bell for admins: requests waiting too long are among their notifications.
function AdminHeader({ bell = false }: { bell?: boolean }) {
  return (
    <PageHeader
      title="Admin"
      backHref="/profile"
      actions={
        <>
          {bell && <NotificationBell />}
          <RefreshButton />
        </>
      }
    >
      <AdminTabs />
    </PageHeader>
  );
}
