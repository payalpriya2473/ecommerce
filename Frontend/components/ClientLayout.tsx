"use client";

import { useState, useEffect } from "react";
import { PermissionProvider } from "@/contexts/Permissionprovider";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/toaster";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    setIsLoggedIn(!!token);
  }, []);

  return (
    // <PermissionProvider>
    <div className="flex h-screen overflow-hidden">
      {isLoggedIn && (
        <AppSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      )}

      <main
        className={`flex-1 transition-all duration-300 ${
          isLoggedIn ? (sidebarCollapsed ? "ml-16" : "ml-64") : ""
        }`}
      >
        <div className="h-full overflow-auto">{children}</div>
        <Toaster />
      </main>
    </div>
    // </PermissionProvider>
  );
}
