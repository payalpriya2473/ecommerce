"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  Key,
  AlertCircle,
  Search,
  UserPlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { rbacAPI } from "@/lib/api";
import type { Role, Permission, UserWithRoles } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";

export default function RBACPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("roles");
  const [loading, setLoading] = useState(true);
  const { canView, canCreate, canEdit, canDelete } = usePermissions();

  // Roles state
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [filteredRoles, setFilteredRoles] = useState<Role[]>([]);
  const [roleSearchTerm, setRoleSearchTerm] = useState("");

  // Permissions state
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);

  // Users state
  const [allUsers, setAllUsers] = useState<UserWithRoles[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithRoles[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  // Dialog states
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isUserRoleDialogOpen, setIsUserRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Form states
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });

  const [userRoleForm, setUserRoleForm] = useState({
    userId: "",
    roleIds: [] as string[],
  });

  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("authToken") || ""
      : "";
  const companyId =
    typeof window !== "undefined"
      ? sessionStorage.getItem("companyId") || ""
      : "";

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  useEffect(() => {
    if (mounted) {
      filterRoles();
    }
  }, [roleSearchTerm, allRoles, mounted]);

  useEffect(() => {
    if (mounted) {
      filterUsers();
    }
  }, [userSearchTerm, allUsers, mounted]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load permissions
      const permissionsRes = await rbacAPI.getAllPermissions(token);
      if (permissionsRes.success) {
        setAllPermissions(permissionsRes.data);
      }

      // Load roles
      const rolesRes = await rbacAPI.getAllRoles(token, companyId);
      if (rolesRes.success) {
        setAllRoles(rolesRes.data);
      }

      // Load users with roles
      const usersRes = await rbacAPI.getUsersWithRoles(token);
      if (usersRes.success) {
        setAllUsers(usersRes.data);
      }
    } catch (error) {
      console.error("Load data error:", error);
      toast.error("Failed to load RBAC data");
    } finally {
      setLoading(false);
    }
  };

  const filterRoles = () => {
    const filtered = allRoles.filter(
      (role) =>
        role.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) ||
        role.description?.toLowerCase().includes(roleSearchTerm.toLowerCase()),
    );
    setFilteredRoles(filtered);
  };

  const filterUsers = () => {
    const filtered = allUsers.filter(
      (user) =>
        user.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        user.employeeName?.toLowerCase().includes(userSearchTerm.toLowerCase()),
    );
    setFilteredUsers(filtered);
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      name: "",
      description: "",
      permissions: [],
    });
    setIsRoleDialogOpen(true);
  };

  const handleEditRole = async (role: Role) => {
    try {
      const res = await rbacAPI.getRoleById(token, role.id);
      if (res.success) {
        setEditingRole(role);
        setRoleForm({
          name: res.data.name,
          description: res.data.description || "",
          permissions: res.data.permissions || [],
        });
        setIsRoleDialogOpen(true);
      }
    } catch (error) {
      toast.error("Failed to load role details");
    }
  };

  const handleDeleteRole = (role: Role) => {
    if (role.isSystemRole) {
      toast.error("System roles cannot be deleted");
      return;
    }
    setRoleToDelete(role);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;

    setFormLoading(true);
    try {
      const res = await rbacAPI.deleteRole(roleToDelete.id, token);
      if (res.success) {
        toast.success("Role deleted successfully");
        loadData();
      } else {
        toast.error(res.message || "Failed to delete role");
      }
    } catch (error) {
      toast.error("Failed to delete role");
    } finally {
      setFormLoading(false);
      setIsDeleteDialogOpen(false);
      setRoleToDelete(null);
    }
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error("Role name is required");
      return;
    }

    if (roleForm.permissions.length === 0) {
      toast.error("At least one permission must be selected");
      return;
    }

    setFormLoading(true);
    try {
      let res;
      if (editingRole) {
        res = await rbacAPI.updateRole(editingRole.id, roleForm, token);
      } else {
        res = await rbacAPI.createRole(roleForm, token);
      }

      if (res.success) {
        toast.success(
          editingRole
            ? "Role updated successfully"
            : "Role created successfully",
        );
        loadData();
        setIsRoleDialogOpen(false);
      } else {
        toast.error(res.message || "Failed to save role");
      }
    } catch (error) {
      toast.error("Failed to save role");
    } finally {
      setFormLoading(false);
    }
  };

  const handleTogglePermission = (permissionId: string) => {
    setRoleForm((prev) => {
      const permissions = prev.permissions.includes(permissionId)
        ? prev.permissions.filter((p) => p !== permissionId)
        : [...prev.permissions, permissionId];
      return { ...prev, permissions };
    });
  };

  const handleSelectAllPermissions = (module: string) => {
    const modulePermissions = allPermissions
      .filter((p) => p.module === module)
      .map((p) => p.id);

    const allSelected = modulePermissions.every((id) =>
      roleForm.permissions.includes(id),
    );

    if (allSelected) {
      setRoleForm((prev) => ({
        ...prev,
        permissions: prev.permissions.filter(
          (id) => !modulePermissions.includes(id),
        ),
      }));
    } else {
      setRoleForm((prev) => ({
        ...prev,
        permissions: [...new Set([...prev.permissions, ...modulePermissions])],
      }));
    }
  };

  const handleManageUserRoles = async (userId: string) => {
    setSelectedUserId(userId);

    try {
      const res = await rbacAPI.getUserRoles(token, userId);
      if (res.success) {
        const existingRoleIds = res.data.map((ur: any) => ur.roleId);
        setUserRoleForm({
          userId,
          roleIds: existingRoleIds,
        });
        setIsUserRoleDialogOpen(true);
      }
    } catch (error) {
      toast.error("Failed to load user roles");
    }
  };

  const handleSaveUserRoles = async () => {
    if (!userRoleForm.userId) {
      toast.error("User must be selected");
      return;
    }

    setFormLoading(true);
    try {
      const res = await rbacAPI.assignUserRoles(
        userRoleForm.userId,
        userRoleForm.roleIds,
        token,
      );
      if (res.success) {
        toast.success("User roles updated successfully");
        loadData();
        setIsUserRoleDialogOpen(false);
      } else {
        toast.error(res.message || "Failed to update user roles");
      }
    } catch (error) {
      toast.error("Failed to update user roles");
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleUserRole = (roleId: string) => {
    setUserRoleForm((prev) => {
      const roleIds = prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId];
      return { ...prev, roleIds };
    });
  };

  const groupPermissionsByModule = () => {
    const grouped: Record<string, Permission[]> = {};
    allPermissions.forEach((permission) => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });
    return grouped;
  };

  const getModuleLabel = (module: string) => {
    return module
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }
  // Page Level Protection
  if (!canView("rbac")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don't have permission to access RBAC management.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Role-Based Access Control
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage roles, permissions, and user access
              </p>
            </div>
            <Shield className="h-12 w-12 text-accent" />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="roles" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Roles & Permissions
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                User Roles
              </TabsTrigger>
            </TabsList>

            {/* Roles Tab */}
            <TabsContent value="roles" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Roles Management</CardTitle>
                      <CardDescription>
                        Create and manage roles with permissions
                      </CardDescription>
                    </div>
                    <PermissionGate module="rbac" action="create">
                      <Button onClick={handleCreateRole}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Role
                      </Button>
                    </PermissionGate>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search roles..."
                        value={roleSearchTerm}
                        onChange={(e) => setRoleSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Permissions</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRoles.map((role) => (
                          <TableRow key={role.id}>
                            <TableCell className="font-medium">
                              {role.name}
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                              {role.description || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {role.permissionCount || 0} permissions
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {role.isSystemRole ? (
                                <Badge variant="outline">System</Badge>
                              ) : (
                                <Badge>Custom</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <PermissionGate module="rbac" action="update">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditRole(role)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </PermissionGate>

                                <PermissionGate module="rbac" action="delete">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRole(role)}
                                    disabled={role.isSystemRole}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </PermissionGate>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredRoles.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-muted-foreground py-8"
                            >
                              No roles found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>User Role Assignment</CardTitle>
                  <CardDescription>
                    Assign roles to users for access control
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Assigned Roles</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.employeeName || "Unknown"}
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell className="max-w-md">
                              <span className="text-sm text-muted-foreground truncate block">
                                {user.roleNames || "No roles assigned"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {user.isActive ? (
                                <Badge variant="default">Active</Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <PermissionGate module="rbac" action="update">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleManageUserRoles(user.id)}
                                >
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  Manage Roles
                                </Button>
                              </PermissionGate>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredUsers.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-muted-foreground py-8"
                            >
                              No users found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Role Dialog */}
          <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>
                  {editingRole ? "Edit Role" : "Create New Role"}
                </DialogTitle>
                <DialogDescription>
                  {editingRole
                    ? "Update role details and permissions"
                    : "Create a new role with specific permissions"}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="roleName">Role Name *</Label>
                      <Input
                        id="roleName"
                        value={roleForm.name}
                        onChange={(e) =>
                          setRoleForm({ ...roleForm, name: e.target.value })
                        }
                        placeholder="e.g., Sales Manager"
                      />
                    </div>

                    <div>
                      <Label htmlFor="roleDescription">Description</Label>
                      <Textarea
                        id="roleDescription"
                        value={roleForm.description}
                        onChange={(e) =>
                          setRoleForm({
                            ...roleForm,
                            description: e.target.value,
                          })
                        }
                        placeholder="Describe the role and its responsibilities"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">
                        Permissions
                      </Label>
                      <Badge variant="secondary">
                        {roleForm.permissions.length} selected
                      </Badge>
                    </div>

                    <div className="space-y-6 border rounded-lg p-4">
                      {Object.entries(groupPermissionsByModule()).map(
                        ([module, perms]) => {
                          const allSelected = perms.every((p) =>
                            roleForm.permissions.includes(p.id),
                          );
                          const someSelected = perms.some((p) =>
                            roleForm.permissions.includes(p.id),
                          );

                          return (
                            <div key={module} className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`module-${module}`}
                                  checked={allSelected}
                                  onCheckedChange={() =>
                                    handleSelectAllPermissions(module)
                                  }
                                />
                                <Label
                                  htmlFor={`module-${module}`}
                                  className="text-sm font-semibold cursor-pointer"
                                >
                                  {getModuleLabel(module)}
                                </Label>
                                {someSelected && !allSelected && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Partial
                                  </Badge>
                                )}
                              </div>
                              <div className="pl-6 grid grid-cols-2 md:grid-cols-3 gap-2">
                                {perms.map((permission) => (
                                  <div
                                    key={permission.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={permission.id}
                                      checked={roleForm.permissions.includes(
                                        permission.id,
                                      )}
                                      onCheckedChange={() =>
                                        handleTogglePermission(permission.id)
                                      }
                                    />
                                    <Label
                                      htmlFor={permission.id}
                                      className="text-sm cursor-pointer"
                                    >
                                      {permission.action
                                        .charAt(0)
                                        .toUpperCase() +
                                        permission.action.slice(1)}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRoleDialogOpen(false)}
                  disabled={formLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveRole} disabled={formLoading}>
                  {formLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingRole ? "Update Role" : "Create Role"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* User Role Assignment Dialog */}
          <Dialog
            open={isUserRoleDialogOpen}
            onOpenChange={setIsUserRoleDialogOpen}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Assign Roles to User</DialogTitle>
                <DialogDescription>
                  Select roles to grant access permissions to this user
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {allRoles
                  .filter((role) => role.isActive)
                  .map((role) => (
                    <div
                      key={role.id}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/5 transition-colors"
                    >
                      <Checkbox
                        id={`user-role-${role.id}`}
                        checked={userRoleForm.roleIds.includes(role.id)}
                        onCheckedChange={() => handleToggleUserRole(role.id)}
                      />
                      <div className="flex-1 space-y-1">
                        <Label
                          htmlFor={`user-role-${role.id}`}
                          className="cursor-pointer font-medium"
                        >
                          {role.name}
                          {role.isSystemRole && (
                            <Badge variant="outline" className="ml-2">
                              System
                            </Badge>
                          )}
                        </Label>
                        {role.description && (
                          <p className="text-sm text-muted-foreground">
                            {role.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {role.permissionCount || 0} permissions
                        </p>
                      </div>
                    </div>
                  ))}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsUserRoleDialogOpen(false)}
                  disabled={formLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveUserRoles} disabled={formLoading}>
                  {formLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Roles
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Role</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this role? This action cannot
                  be undone.
                </DialogDescription>
              </DialogHeader>
              {roleToDelete && (
                <div className="py-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{roleToDelete.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {roleToDelete.permissionCount || 0} permissions will be
                        removed
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  disabled={formLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDeleteRole}
                  disabled={formLoading}
                >
                  {formLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
