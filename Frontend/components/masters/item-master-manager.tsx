// "use client"

// import { useEffect, useState } from "react"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// import { Alert, AlertDescription } from "@/components/ui/alert"
// import { Plus, Trash2, AlertCircle, Package2, Search, Edit } from "lucide-react"
// import { Textarea } from "@/components/ui/textarea"
// import { Badge } from "@/components/ui/badge"
// import { Checkbox } from "@/components/ui/checkbox"
// import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
// import { companyAPI, brandAPI, itemGroupAPI, itemAPI } from "@/lib/api"
// import type { Company, Brand, ItemGroup, Item } from "@/lib/api"
// import { usePermissions } from "@/hooks/usePermissions"
// import { PermissionGate } from "@/components/PermissionGate"

// const EMPTY_FORM = {
//   itemName: "", itemGroupId: "", brandId: "", uom: "Pcs",
//   hsnCode: "", gst: "", openingStock: "", tax: "", minimumQty: "",
//   maxMOPPercent: "", offerPrice: "", stockValue: "", margin: "",
//   incentive: "", maxMOPAmount: "", nlc: "", hasDemoInstallation: false,
//   freeService: "", billPrintNote: "", warranty: "",
// }

// const UOM_OPTIONS = ["Pcs", "Kg", "Ltr", "Box", "Set", "Meter", "Sq.Ft", "Ton", "Unit"]

// export function ItemMasterManager() {
//   const [companies, setCompanies]             = useState<Company[]>([])
//   const [brands, setBrands]                   = useState<Brand[]>([])
//   const [itemGroups, setItemGroups]           = useState<ItemGroup[]>([])
//   const [items, setItems]                     = useState<Item[]>([])
//   const [selectedCompany, setSelectedCompany] = useState("")
//   const [searchQuery, setSearchQuery]         = useState("")
//   const [formData, setFormData]               = useState({ ...EMPTY_FORM })
//   const [error, setError]                     = useState("")
//   const [success, setSuccess]                 = useState("")

//   // Edit state
//   const [editDialogOpen, setEditDialogOpen]   = useState(false)
//   const [editingItem, setEditingItem]         = useState<Item | null>(null)
//   const [editFormData, setEditFormData]       = useState({ ...EMPTY_FORM })

//   const { canView } = usePermissions()

//   //  Fetch companies 
//   useEffect(() => {
//     const fetchCompanies = async () => {
//       const token = sessionStorage.getItem("authToken")
//       if (!token) return
//       const res = await companyAPI.getAll(token)
//       if (res.success) setCompanies(res.data)
//     }
//     fetchCompanies()
//   }, [])

//   //  Fetch brands, groups and items when company changes 
//   useEffect(() => {
//     let isMounted = true
//     const fetchData = async () => {
//       const token = sessionStorage.getItem("authToken")
//       if (!token) return

//       const [brandRes, groupRes, itemRes] = await Promise.all([
//         selectedCompany ? brandAPI.getAll(token, selectedCompany)     : brandAPI.getAll(token),
//         selectedCompany ? itemGroupAPI.getAll(token, selectedCompany) : itemGroupAPI.getAll(token),
//         selectedCompany ? itemAPI.getAll(token, selectedCompany)      : itemAPI.getAll(token),
//       ])

//       if (isMounted) {
//         if (brandRes.success) setBrands(brandRes.data)
//         if (groupRes.success) setItemGroups(groupRes.data)
//         if (itemRes.success)  setItems(itemRes.data)
//       }
//     }
//     fetchData()
//     return () => { isMounted = false }
//   }, [selectedCompany])

//   const handleChange = (field: string, value: string | boolean) => {
//     setFormData(prev => ({ ...prev, [field]: value }))
//     setError("")
//   }

//   const handleEditChange = (field: string, value: string | boolean) => {
//     setEditFormData(prev => ({ ...prev, [field]: value }))
//   }

//   // Add item 
//   const handleAddItem = async () => {
//     setError("")
//     setSuccess("")

//     if (!selectedCompany)         return setError("Please select a company")
//     if (!formData.itemName.trim()) return setError("Please enter item name")
//     if (!formData.itemGroupId || !formData.brandId)
//       return setError("Please select item group and brand")

//     const token = sessionStorage.getItem("authToken")
//     if (!token) return

//     const res = await itemAPI.register({
//       companyId:   selectedCompany,
//       itemGroupId: formData.itemGroupId,
//       brandId:     formData.brandId,
//       itemName:    formData.itemName.trim(),
//       uom:         formData.uom,
//       hsnCode:     formData.hsnCode.trim() || undefined,
//       gst:                parseFloat(formData.gst)          || 0,
//       openingStock:       parseFloat(formData.openingStock) || 0,
//       tax:                parseFloat(formData.tax)          || 0,
//       minimumQty:         parseFloat(formData.minimumQty)   || 0,
//       maxMOPPercent:      parseFloat(formData.maxMOPPercent)|| 0,
//       offerPrice:         parseFloat(formData.offerPrice)   || 0,
//       stockValue:         parseFloat(formData.stockValue)   || 0,
//       margin:             parseFloat(formData.margin)       || 0,
//       incentive:          parseFloat(formData.incentive)    || 0,
//       maxMOPAmount:       parseFloat(formData.maxMOPAmount) || 0,
//       nlc:                parseFloat(formData.nlc)          || 0,
//       hasDemoInstallation: formData.hasDemoInstallation,
//       freeService:   formData.freeService.trim()  || undefined,
//       billPrintNote: formData.billPrintNote.trim()|| undefined,
//       warranty:      formData.warranty.trim()     || undefined,
//     }, token)

//     if (res.success) {
//       setItems(prev => [res.data, ...prev])
//       setFormData({ ...EMPTY_FORM })
//       setSuccess(`Item "${res.data.itemName}" added successfully`)
//       setTimeout(() => setSuccess(""), 3000)
//     } else {
//       setError(res.message || "Failed to add item")
//     }
//   }

//   // Delete item
//   const handleDeleteItem = async (id: string) => {
//     if (!confirm("Are you sure you want to delete this item?")) return
//     const token = sessionStorage.getItem("authToken")
//     if (!token) return

//     const res = await itemAPI.delete(id, token)
//     if (res.success) {
//       setItems(prev => prev.filter(i => i.id !== id))
//       setSuccess("Item deleted successfully")
//       setTimeout(() => setSuccess(""), 3000)
//     } else {
//       alert(res.message || "Failed to delete item")
//     }
//   }

//   // Edit item 
//   const handleEditClick = (item: Item) => {
//     setEditingItem(item)
//     setEditFormData({
//       itemName:            item.itemName,
//       itemGroupId:         item.itemGroupId || "",
//       brandId:             item.brandId     || "",
//       uom:                 item.uom,
//       hsnCode:             item.hsnCode     || "",
//       gst:                 item.gst.toString(),
//       openingStock:        item.openingStock.toString(),
//       tax:                 item.tax.toString(),
//       minimumQty:          item.minimumQty.toString(),
//       maxMOPPercent:       item.maxMOPPercent.toString(),
//       offerPrice:          item.offerPrice.toString(),
//       stockValue:          item.stockValue.toString(),
//       margin:              item.margin.toString(),
//       incentive:           item.incentive.toString(),
//       maxMOPAmount:        item.maxMOPAmount.toString(),
//       nlc:                 item.nlc.toString(),
//       hasDemoInstallation: item.hasDemoInstallation,
//       freeService:         item.freeService  || "",
//       billPrintNote:       item.billPrintNote|| "",
//       warranty:            item.warranty     || "",
//     })
//     setEditDialogOpen(true)
//   }

//   const handleUpdateItem = async () => {
//     if (!editingItem) return
//     const token = sessionStorage.getItem("authToken")
//     if (!token) return

//     const res = await itemAPI.update(editingItem.id, {
//       itemGroupId:   editFormData.itemGroupId || undefined,
//       brandId:       editFormData.brandId     || undefined,
//       itemName:      editFormData.itemName.trim(),
//       uom:           editFormData.uom,
//       hsnCode:       editFormData.hsnCode.trim() || undefined,
//       gst:                parseFloat(editFormData.gst)          || 0,
//       openingStock:       parseFloat(editFormData.openingStock) || 0,
//       tax:                parseFloat(editFormData.tax)          || 0,
//       minimumQty:         parseFloat(editFormData.minimumQty)   || 0,
//       maxMOPPercent:      parseFloat(editFormData.maxMOPPercent)|| 0,
//       offerPrice:         parseFloat(editFormData.offerPrice)   || 0,
//       stockValue:         parseFloat(editFormData.stockValue)   || 0,
//       margin:             parseFloat(editFormData.margin)       || 0,
//       incentive:          parseFloat(editFormData.incentive)    || 0,
//       maxMOPAmount:       parseFloat(editFormData.maxMOPAmount) || 0,
//       nlc:                parseFloat(editFormData.nlc)          || 0,
//       hasDemoInstallation: editFormData.hasDemoInstallation,
//       freeService:   editFormData.freeService.trim()   || undefined,
//       billPrintNote: editFormData.billPrintNote.trim() || undefined,
//       warranty:      editFormData.warranty.trim()      || undefined,
//     }, token)

//     if (res.success) {
//       setItems(prev => prev.map(i => i.id === editingItem.id ? res.data : i))
//       setEditDialogOpen(false)
//       setEditingItem(null)
//       setSuccess("Item updated successfully")
//       setTimeout(() => setSuccess(""), 3000)
//     } else {
//       alert(res.message || "Failed to update item")
//     }
//   }

//   const filteredItems = items.filter(i =>
//     i.itemName.toLowerCase().includes(searchQuery.toLowerCase())
//   )

//   //Access guard 
//   if (!canView("items")) {
//     return (
//       <Card className="max-w-md mx-auto mt-10">
//         <CardContent className="flex flex-col items-center justify-center py-16">
//           <AlertCircle className="h-10 w-10 text-destructive mb-4" />
//           <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
//           <p className="text-muted-foreground text-center">You don&apos;t have permission to view items.</p>
//         </CardContent>
//       </Card>
//     )
//   }

//   // ── Shared form fields renderer ───────────────────────────
//   const renderFormFields = (data: typeof EMPTY_FORM, onChange: (f: string, v: string | boolean) => void) => (
//     <>
//       <div className="grid md:grid-cols-2 gap-4">
//         <div className="space-y-2">
//           <Label>Item Group <span className="text-destructive">*</span></Label>
//           <Select value={data.itemGroupId} onValueChange={v => onChange("itemGroupId", v)}>
//             <SelectTrigger><SelectValue placeholder="Select item group" /></SelectTrigger>
//             <SelectContent>
//               {itemGroups.length === 0
//                 ? <div className="p-2 text-sm text-muted-foreground">No item groups available</div>
//                 : itemGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
//             </SelectContent>
//           </Select>
//         </div>
//         <div className="space-y-2">
//           <Label>Brand <span className="text-destructive">*</span></Label>
//           <Select value={data.brandId} onValueChange={v => onChange("brandId", v)}>
//             <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
//             <SelectContent>
//               {brands.length === 0
//                 ? <div className="p-2 text-sm text-muted-foreground">No brands available</div>
//                 : brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
//             </SelectContent>
//           </Select>
//         </div>
//       </div>

//       <div className="grid md:grid-cols-3 gap-4">
//         <div className="space-y-2">
//           <Label>UOM <span className="text-destructive">*</span></Label>
//           <Select value={data.uom} onValueChange={v => onChange("uom", v)}>
//             <SelectTrigger><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
//             </SelectContent>
//           </Select>
//         </div>
//         <div className="space-y-2">
//           <Label>HSN Code</Label>
//           <Input value={data.hsnCode} onChange={e => onChange("hsnCode", e.target.value)} placeholder="8415" />
//         </div>
//         <div className="space-y-2">
//           <Label>GST (%)</Label>
//           <Input type="number" value={data.gst} onChange={e => onChange("gst", e.target.value)} placeholder="18" step="0.01" />
//         </div>
//       </div>

//       <div className="grid md:grid-cols-4 gap-4">
//         {[["openingStock","Opening Stock","0"],["tax","Tax","0.00"],["minimumQty","Min Qty","0"],["maxMOPPercent","Max MOP %","0"]].map(([f,l,p]) => (
//           <div key={f} className="space-y-2">
//             <Label>{l}</Label>
//             <Input type="number" value={(data as any)[f]} onChange={e => onChange(f, e.target.value)} placeholder={p} step="0.01" />
//           </div>
//         ))}
//       </div>

//       <div className="grid md:grid-cols-4 gap-4">
//         {[["offerPrice","Offer Price","0.00"],["stockValue","Stock Value","0.00"],["margin","Margin","0.00"],["incentive","Incentive","0.00"]].map(([f,l,p]) => (
//           <div key={f} className="space-y-2">
//             <Label>{l}</Label>
//             <Input type="number" value={(data as any)[f]} onChange={e => onChange(f, e.target.value)} placeholder={p} step="0.01" />
//           </div>
//         ))}
//       </div>

//       <div className="grid md:grid-cols-2 gap-4">
//         <div className="space-y-2">
//           <Label>Max MOP Amount</Label>
//           <Input type="number" value={data.maxMOPAmount} onChange={e => onChange("maxMOPAmount", e.target.value)} placeholder="0.00" step="0.01" />
//         </div>
//         <div className="space-y-2">
//           <Label>NLC</Label>
//           <Input type="number" value={data.nlc} onChange={e => onChange("nlc", e.target.value)} placeholder="0.00" step="0.01" />
//         </div>
//       </div>

//       <div className="flex items-center space-x-2">
//         <Checkbox id={`demo-${Math.random()}`} checked={data.hasDemoInstallation} onCheckedChange={v => onChange("hasDemoInstallation", v as boolean)} />
//         <Label className="cursor-pointer">Demo / Installation</Label>
//       </div>

//       <div className="space-y-2">
//         <Label>Free Service</Label>
//         <Input value={data.freeService} onChange={e => onChange("freeService", e.target.value)} placeholder="e.g., 1 Year Free Service" />
//       </div>
//       <div className="space-y-2">
//         <Label>Bill Print Note</Label>
//         <Textarea value={data.billPrintNote} onChange={e => onChange("billPrintNote", e.target.value)} placeholder="Note to be printed on bill" rows={2} />
//       </div>
//       <div className="space-y-2">
//         <Label>Warranty</Label>
//         <Textarea value={data.warranty} onChange={e => onChange("warranty", e.target.value)} placeholder="Warranty details" rows={2} />
//       </div>
//     </>
//   )

//   return (
//     <div className="space-y-6">
//       {/* ADD FORM */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Add Item Master</CardTitle>
//           <CardDescription>Create a new item in the inventory system</CardDescription>
//         </CardHeader>
//         <CardContent className="space-y-4">
//           {/* Company */}
//           <div className="space-y-2">
//             <Label>Company <span className="text-destructive">*</span></Label>
//             <Select value={selectedCompany} onValueChange={setSelectedCompany}>
//               <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
//               <SelectContent>
//                 {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
//               </SelectContent>
//             </Select>
//           </div>

//           <div className="space-y-2">
//             <Label htmlFor="item-name">Item Name <span className="text-destructive">*</span></Label>
//             <Input id="item-name" value={formData.itemName} onChange={e => handleChange("itemName", e.target.value)} placeholder="e.g., LG Split AC 1.5 Ton" />
//           </div>

//           {renderFormFields(formData, handleChange)}

//           {error   && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
//           {success && <Alert className="border-green-200 bg-green-50 text-green-800"><AlertDescription>{success}</AlertDescription></Alert>}

//           <PermissionGate module="items" action="create">
//             <Button onClick={handleAddItem} className="w-full" disabled={!selectedCompany}>
//               <Plus className="h-4 w-4 mr-2" />Add Item
//             </Button>
//           </PermissionGate>
//         </CardContent>
//       </Card>

//       {/* LIST */}
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="flex items-center gap-2"><Package2 className="h-5 w-5" />Items List</CardTitle>
//               <CardDescription>
//                 {selectedCompany ? `${items.length} item(s) in inventory` : `${items.length} item(s) total`}
//               </CardDescription>
//             </div>
//             {items.length > 0 && (
//               <div className="flex items-center gap-2 w-64">
//                 <Search className="h-4 w-4 text-muted-foreground" />
//                 <Input placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-9" />
//               </div>
//             )}
//           </div>
//         </CardHeader>
//         <CardContent>
//           {filteredItems.length === 0 ? (
//             <div className="text-center py-8 text-muted-foreground">
//               <Package2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
//               <p>{searchQuery ? "No items found matching your search" : "No items added yet"}</p>
//             </div>
//           ) : (
//             <div className="space-y-2">
//               {filteredItems.map(item => (
//                 <div key={item.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50">
//                   <div className="flex-1">
//                     <p className="font-medium">{item.itemName}</p>
//                     <div className="flex items-center gap-2 mt-1">
//                       {item.itemGroupName && <Badge variant="secondary" className="text-xs">{item.itemGroupName}</Badge>}
//                       {item.brandName     && <Badge variant="secondary" className="text-xs">{item.brandName}</Badge>}
//                       <Badge variant="secondary" className="text-xs">{item.uom}</Badge>
//                     </div>
//                     <p className="text-sm text-muted-foreground mt-1">
//                       Stock: {item.openingStock} | GST: {item.gst}% | Margin: {item.margin}
//                     </p>
//                   </div>
//                   <div className="flex gap-1">
//                     <PermissionGate module="items" action="update">
//                       <Button variant="ghost" size="sm" onClick={() => handleEditClick(item)}>
//                         <Edit className="h-4 w-4" />
//                       </Button>
//                     </PermissionGate>
//                     <PermissionGate module="items" action="delete">
//                       <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteItem(item.id)}>
//                         <Trash2 className="h-4 w-4" />
//                       </Button>
//                     </PermissionGate>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* EDIT DIALOG */}
//       <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
//         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>Edit Item</DialogTitle>
//             <DialogDescription>Update item details</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-4">
//             <div className="space-y-2">
//               <Label>Item Name</Label>
//               <Input value={editFormData.itemName} onChange={e => handleEditChange("itemName", e.target.value)} />
//             </div>
//             {renderFormFields(editFormData, handleEditChange)}
//             <div className="flex justify-end gap-2 pt-4">
//               <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
//               <Button onClick={handleUpdateItem}>Save Changes</Button>
//             </div>
//           </div>
//         </DialogContent>
//       </Dialog>
//     </div>
//   )
// }