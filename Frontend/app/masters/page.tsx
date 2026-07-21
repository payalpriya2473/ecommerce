"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Briefcase, Building2, Package, Tag, FolderTree, Package2 } from "lucide-react"
import { DepartmentManager } from "@/components/masters/department-manager"
import { DesignationManager } from "@/components/masters/designation-manager"
import { ItemGroupManager } from "@/components/masters/item-group-manager"
import { BrandManager } from "@/components/masters/brand-manager"
import { CategoryManager } from "@/components/masters/category-manager"
// import { ItemMasterManager } from "@/components/masters/item-master-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function MastersPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Master Data Management</h2>
            <p className="text-muted-foreground">Manage organization and inventory master data</p>
          </div>

          <div className="space-y-8">
            {/* Organization Masters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Organization Masters</CardTitle>
                <CardDescription>Manage departments and designations</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="departments" className="space-y-6">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="departments" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Departments
                    </TabsTrigger>
                    <TabsTrigger value="designations" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Designations
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="departments">
                    <DepartmentManager />
                  </TabsContent>

                  <TabsContent value="designations">
                    <DesignationManager />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Inventory Masters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Inventory Masters</CardTitle>
                <CardDescription>Manage item groups, brands, categories, and items</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="item-groups" className="space-y-6">
                  <TabsList className="grid w-full max-w-2xl grid-cols-4">
                    <TabsTrigger value="item-groups" className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Item Groups
                    </TabsTrigger>
                    <TabsTrigger value="brands" className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Brands
                    </TabsTrigger>
                    <TabsTrigger value="categories" className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4" />
                      Categories
                    </TabsTrigger>
                    <TabsTrigger value="items" className="flex items-center gap-2">
                      <Package2 className="h-4 w-4" />
                      Items
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="item-groups">
                    <ItemGroupManager />
                  </TabsContent>

                  <TabsContent value="brands">
                    <BrandManager />
                  </TabsContent>

                  <TabsContent value="categories">
                    <CategoryManager />
                  </TabsContent>

                  {/* <TabsContent value="items">
                    <ItemMasterManager />
                  </TabsContent> */}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
