"use client";

import React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { usePermissions } from "@/contexts/Permissionprovider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PermissionButtonProps extends ButtonProps {
  module: string;
  action: string;
  fallback?: "hide" | "disable" | "lock";
  children: React.ReactNode;
}

export function PermissionButton({
  module,
  action,
  fallback = "hide",
  children,
  ...buttonProps
}: PermissionButtonProps) {
  const { hasPermission, loading } = usePermissions();

  // Don't render anything while loading
  if (loading) {
    return null;
  }

  const permitted = hasPermission(module, action);

  // Hide button if no permission and fallback is 'hide'
  if (!permitted && fallback === "hide") {
    return null;
  }

  // Show disabled button if no permission and fallback is 'disable'
  if (!permitted && fallback === "disable") {
    return (
      <Button {...buttonProps} disabled>
        {children}
      </Button>
    );
  }

  // Show locked button with tooltip if no permission and fallback is 'lock'
  if (!permitted && fallback === "lock") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button {...buttonProps} disabled className="opacity-50">
              <Lock className="h-4 w-4 mr-2" />
              {children}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              You don't have permission to {action} {module}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Show normal button if user has permission
  return <Button {...buttonProps}>{children}</Button>;
}
