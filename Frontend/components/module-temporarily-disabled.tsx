"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";

/**
 * Keeps a Next.js filesystem route safe while its feature implementation is
 * temporarily disabled. The original route code remains in its source file
 * and can be restored by rendering that component again.
 */
export function ModuleTemporarilyDisabled({ moduleName }: { moduleName: string }) {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="flex min-h-[50vh] items-center justify-center px-4">
          <div className="max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">{moduleName} is temporarily unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">This module has been disabled by the administrator.</p>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
