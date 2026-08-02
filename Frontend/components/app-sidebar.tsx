"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Users,
  Briefcase,
  LayoutDashboard,
  FileText,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Shield,
  Wrench,
  ChevronDown,
  Package,
  UserCircle,
  Store,
  Tag,
  FolderTree,
  Package2,
  LogOut,
  User,
  Settings,
  Receipt,
  TrendingUp,
  Palette,
  Mail,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { usePermissions } from "@/hooks/usePermissions";

type MenuItem = {
  title: string;
  href?: string;
  icon: any;
  requiredPermission?: string; // Format: "module:action"
  disabled?: boolean;
  children?: MenuItem[];
};

interface AppSidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function AppSidebar({
  collapsed: externalCollapsed,
  onCollapsedChange,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const {
    hasPermission,
    loading: permissionsLoading,
    isSuperAdmin,
  } = usePermissions();

  const parentMenus = ["Master Data", "Transaction", "Settings"];

  useEffect(() => {
    const role = sessionStorage.getItem("userRole") || "";
    const email = sessionStorage.getItem("userEmail") || "";
    setUserRole(role);
    setUserEmail(email);
  }, []);

  useEffect(() => {
    if (pathname) {
      const pathParts = pathname.split("/");
      if (pathParts.includes("finance-companies")) {
        setOpenMenus({ "Master Data": true });
      } else if (pathParts.includes("inventory-masters")) {
        const base: Record<string, boolean> = { "Master Data": true, "Inventory": true };
        if (pathParts.includes("offers")) base["Offers"] = true;
        setOpenMenus(base);
      } else if (
        pathParts.includes("company") ||
        pathParts.includes("branch")
      ) {
        setOpenMenus({ "Master Data": true });
      } else if (pathParts.includes("employee")) {
        setOpenMenus({ "Master Data": true, "Human Resource": true });
      } else if (
        pathParts.includes("organization-masters") ||
        pathParts.includes("rbac")
      ) {
        setOpenMenus({ "Master Data": true, "Human Resource": true });
      } else if (pathParts.includes("technician")) {
        setOpenMenus({ "Master Data": true });
      } else if (
        pathParts.includes("suppliers") ||
        pathParts.includes("purchase-orders") ||
        pathParts.includes("purchase-invoices") ||
        pathParts.includes("sales-invoices")
      ) {
        if (pathParts.includes("suppliers")) {
          setOpenMenus({ "Master Data": true });
        } else {
          setOpenMenus({ Transaction: true });
        }
      } else if (pathParts.includes("settings")) {
        setOpenMenus({ Settings: true });
      }
    }
  }, [pathname]);

  // Close all menus when sidebar collapses
  useEffect(() => {
    if (collapsed) {
      setOpenMenus({});
    }
  }, [collapsed]);

  const toggleMenu = (title: string, depth: number) => {
    setOpenMenus((prev) => {
      if (depth === 0) {
        // Close all top-level parents except the one being toggled
        const newState: Record<string, boolean> = {};
        parentMenus.forEach((menu) => {
          newState[menu] = menu === title ? !prev[menu] : false;
        });
        return newState;
      } else {
        // Sub-menu toggle — keep parent open, toggle only the sub
        return {
          ...prev,
          [title]: !prev[title],
        };
      }
    });
  };

  const handleToggleCollapse = () => {
    const newCollapsed = !collapsed;
    if (onCollapsedChange) {
      onCollapsedChange(newCollapsed);
    } else {
      setInternalCollapsed(newCollapsed);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("permissions:clear"));
    }
    router.push("/login");
  };

  const menuItems: MenuItem[] = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Live Stock",
      href: "/live-stock",
      icon: Package2,
    },
    {
      title: "Master Data",
      icon: Briefcase,
      children: [
        {
          title: "Companies",
          href: "/company/list",
          icon: Building2,
          requiredPermission: "companies:read",
        },
        {
          title: "Branches",
          href: "/branch/list",
          icon: Store,
          requiredPermission: "branches:read",
        },
        {
          title: "Inventory",
          icon: Package,
          children: [
            {
              title: "Categories",
              href: "/inventory-masters/categories",
              icon: FolderTree,
              requiredPermission: "categories:read",
            },
            {
              title: "Brands",
              href: "/inventory-masters/brands",
              icon: Tag,
              requiredPermission: "brands:read",
            },
            {
              title: "Item Groups",
              href: "/inventory-masters/item-groups",
              icon: Package,
              requiredPermission: "item_groups:read",
            },
            {
              title: "Items",
              href: "/inventory-masters/items",
              icon: Package2,
              requiredPermission: "item_master:read",
            },
            {
              title: "Offers",
              icon: Tag,
              children: [
                {
                  title: "Offer Items",
                  href: "/inventory-masters/offers/items",
                  icon: Package2,
                },
                {
                  title: "Bank & Card Offers",
                  href: "/inventory-masters/offers/bank",
                  icon: Receipt,
                },
                {
                  title: "Brand Deals",
                  href: "/inventory-masters/offers/brand",
                  icon: Tag,
                },
                {
                  title: "Exclusive Coupons",
                  href: "/inventory-masters/offers/coupons",
                  icon: FileText,
                },
                {
                  title: "Combo Deals & Clearance",
                  href: "/inventory-masters/offers/combo",
                  icon: Package,
                },
                {
                  title: "Exchange Offers",
                  href: "/inventory-masters/offers/exchange",
                  icon: Repeat,
                },
              ],
            },
            {
              title: "Incentive",
              href: "/inventory-masters/incentives",
              icon: TrendingUp,
              requiredPermission: "items:read",
            },
            {                                          
  title: "Color Master",
  href: "/inventory-masters/colors",
  icon: Palette,
  requiredPermission: "colors:read",
},

          ],
        },
        {
          title: "Human Resource",
          icon: UserCircle,
          children: [
            {
              title: "Employees",
              href: "/employee/list",
              icon: Users,
              requiredPermission: "employees:read",
            },
            {
              title: "Departments",
              href: "/organization-masters/departments",
              icon: Building2,
              requiredPermission: "departments:read",
            },
            {
              title: "Designations",
              href: "/organization-masters/designations",
              icon: Briefcase,
              requiredPermission: "designations:read",
            },
            {
              title: "RBAC",
              href: "/rbac",
              icon: Shield,
              requiredPermission: "rbac:read",
            },
          ],
        },
        {
          title: "Technicians",
          href: "/technician/list",
          icon: Wrench,
          requiredPermission: "technicians:read",
        },
        {
          title: "Suppliers",
          href: "/suppliers/list",
          icon: Users,
          requiredPermission: "suppliers:read",
        },
        {
          title: "Finance Comp.",
          href: "/inventory-masters/finance-companies",
          icon: Building2,
          requiredPermission: "finance_companies:read",
        },
      ],
    },
    {
  title: "Transaction",
  icon: Briefcase,
  children: [
    {
      title: "Purchase Orders",
      href: "/purchase-orders/list",
      icon: FileText,
      requiredPermission: "purchase_orders:read",
    },
    {
      title: "Purchase Invoices",
      href: "/purchase-invoices/list",
      icon: FileText,
      requiredPermission: "purchase_invoices:read",
    },
    {
  title: "Sales Invoices",
  href: "/sales-invoices/list",
  icon: FileText, 
  requiredPermission: "sales_invoices:read",
},
  ],
},
   {
  title: "Settings",
  icon: Settings,
  children: [
    {
      title: "Invoice Settings",
      href: "/settings/invoice",
      icon: Receipt,
      requiredPermission: "settings:read",
    },
    {
      title: "Email Config",
      href: "/settings/email",
      icon: Mail,
      requiredPermission: "email_config:view",
    },
  ],
},
    {
      title: "Reports",
      href: "/reports",
      icon: FileText,
      requiredPermission: "reports:read",
      disabled: true,
    },
    {
      title: "Analytics",
      href: "/analytics",
      icon: BarChart3,
      requiredPermission: "analytics:read",
      disabled: true,
    },
  ];

  const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .map((item) => {
        const filteredChildren = item.children
          ? filterMenuItems(item.children)
          : undefined;
        return { ...item, children: filteredChildren };
      })
      .filter((item) => {
        if (item.children) return item.children.length > 0;
        if (!item.requiredPermission) return true;
        if (isSuperAdmin) return true;
        const [module, action] = item.requiredPermission.split(":");
        return hasPermission(module, action);
      });
  };

  const filteredMenuItems = permissionsLoading ? [] : filterMenuItems(menuItems);

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const isActive = pathname === item.href && item.href !== undefined;
    const hasChildren = item.children && item.children.length > 0;

    // Collapsible group — expanded sidebar
    if (hasChildren && !collapsed) {
      return (
        <Collapsible
          key={item.title}
          open={openMenus[item.title] || false}
          onOpenChange={() => toggleMenu(item.title, depth)}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              depth === 1 && "pl-9",
              depth === 2 && "pl-12",
              depth === 3 && "pl-14",
              "text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="flex-1 text-left">{item.title}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                openMenus[item.title] && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            {item.children?.map((child) => renderMenuItem(child, depth + 1))}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    // Collapsed sidebar — icon only with hover tooltip
    if (hasChildren && collapsed) {
      return (
        <li key={item.title} className="relative group">
          <div
            className={cn(
              "flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all cursor-pointer",
              "text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            title={item.title}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
          </div>
          <div className="absolute left-full ml-2 top-0 z-50 hidden group-hover:block bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg border whitespace-nowrap">
            <p className="font-semibold text-sm">{item.title}</p>
            {item.children && (
              <ul className="mt-1 space-y-1">
                {item.children.map((child) => (
                  <li key={child.title}>
                    <Link
                      href={child.href || "#"}
                      className="text-xs hover:text-accent block py-0.5"
                    >
                      {child.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      );
    }

    // Regular leaf item
    return (
      <li key={item.title}>
        <Link
          href={item.href || "#"}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            collapsed && "justify-center",
            item.disabled && "pointer-events-none opacity-40",
            depth === 1 && !collapsed && "pl-9",
            depth === 2 && !collapsed && "pl-12 text-sm",
            depth === 3 && !collapsed && "pl-14 text-sm",
            isActive
              ? "bg-gradient-to-r from-accent to-accent-secondary text-white shadow-sm"
              : "text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          title={collapsed ? item.title : undefined}
        >
          <item.icon
            className={cn("flex-shrink-0", depth >= 2 ? "h-4 w-4" : "h-5 w-5")}
          />
          {!collapsed && <span>{item.title}</span>}
          {!collapsed && item.disabled && (
            <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">
              Soon
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-sidebar transition-all duration-300 shadow-sm",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4 bg-gradient-to-r from-accent/5 to-accent-secondary/5">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 overflow-hidden rounded-lg border bg-white shadow-sm">
              <Image
                src="/applenext_icon.png"
                alt="AppleNext"
                width={40}
                height={40}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-none enterprise-gradient-text">
                AppleNext
              </span>
              <span className="text-xs text-muted-foreground">
                Enterprise Suite
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto h-10 w-10 overflow-hidden rounded-lg border bg-white shadow-sm">
            <Image
              src="/applenext_icon.png"
              alt="AppleNext"
              width={40}
              height={40}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleCollapse}
            className="h-7 w-7 hover:bg-accent/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleCollapse}
            className="h-7 w-7 hover:bg-accent/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Role Badge */}
      {!collapsed && userRole && (
        <div className="px-3 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
            <Shield className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wide">
              {isSuperAdmin ? "Super Admin" : userRole.replace("_", " ")}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav
        className="overflow-y-auto p-3"
        style={{ height: "calc(100vh - 16rem)" }}
      >
        {permissionsLoading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            {!collapsed && (
              <p className="text-xs text-muted-foreground">Loading menu...</p>
            )}
          </div>
        ) : filteredMenuItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Shield className="h-12 w-12 text-muted-foreground/50" />
            {!collapsed && (
              <p className="text-xs text-muted-foreground text-center">
                No menu items available.
                <br />
                Contact your administrator.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredMenuItems.map((item) => renderMenuItem(item))}
          </ul>
        )}
      </nav>

      {/* Footer - User Info & Logout */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-sidebar">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-accent/20 to-accent-secondary/20 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {userEmail || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {userRole ? userRole.replace("_", " ") : "Role"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Collapsed Footer */}
      {collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-2 border-t bg-sidebar">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-8 w-8 mx-auto hover:bg-red-50 hover:text-red-600"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
