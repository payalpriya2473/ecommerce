"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";

/** Layout + permission gate shared by every report / analytics page. */
export function ReportPageShell({
  children,
  permission = "reports",
  backHref = "/reports",
  backLabel = "All reports",
}: {
  children: ReactNode;
  permission?: string;
  backHref?: string | null;
  backLabel?: string;
}) {
  const { hasPermission, loading } = usePermissions();
  const allowed = hasPermission(permission, "view");

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        {!loading && !allowed ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">You don&apos;t have permission to view {permission}.</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="py-8 px-4 md:px-6 lg:px-8">
            {backHref && (
              <Link href={backHref} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
                <ChevronLeft className="h-4 w-4 mr-1" /> {backLabel}
              </Link>
            )}
            {children}
          </div>
        )}
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
