"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  Package2,
  AlertCircle,
  ArrowLeft,
  Edit,
  ChevronLeft,
  ChevronRight,
  Palette,
  Tag,
  Box,
  ReceiptText,
  ShieldCheck,
  Wrench,
  Layers,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { itemAPI } from "@/lib/api";
import Link from "next/link";

const API_ROOT =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:5001";

function toAbsUrl(url?: string) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_ROOT}${url}`;
}

// ─────────────────────────────────────────────────────────────
// Image Gallery
// ─────────────────────────────────────────────────────────────
function ImageGallery({ images }: { images: any[] }) {
  const [current, setCurrent] = useState(0);
  if (!images?.length) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl bg-muted border">
        <div className="text-center text-muted-foreground">
          <Package2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No images</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden border bg-black aspect-square max-h-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toAbsUrl(images[current]?.imageUrl) || ""}
          alt={`Product image ${current + 1}`}
          className="w-full h-full object-contain"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((p) => (p - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrent((p) => (p + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              {current + 1}/{images.length}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                i === current ? "border-red-600" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toAbsUrl(img.imageUrl) || ""}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Color Card
// ─────────────────────────────────────────────────────────────
function ColorCard({ color }: { color: any }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = color.images || [];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b bg-slate-50">
        <div
          className="h-8 w-8 rounded-full border border-black/10 flex-shrink-0"
          style={{ backgroundColor: color.colorHex || "#cccccc" }}
        />
        <div>
          <p className="font-medium text-sm">{color.colorName || "Default"}</p>
          {color.colorHex && (
            <p className="text-xs text-muted-foreground font-mono">{color.colorHex}</p>
          )}
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          {images.length} image{images.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      {images.length > 0 && (
        <div className="p-3">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-muted mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toAbsUrl(images[imgIdx]?.imageUrl) || ""}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {images.map((_: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`flex-shrink-0 w-10 h-10 rounded overflow-hidden border-2 transition-colors ${
                    i === imgIdx ? "border-red-600" : "border-transparent bg-muted"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toAbsUrl(images[i]?.imageUrl) || ""}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Info Row helper
// ─────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// View Page Content
// ─────────────────────────────────────────────────────────────
function ItemViewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("id");

  const [item, setItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!itemId) {
      setError("No item ID provided");
      setIsLoading(false);
      return;
    }
    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      try {
        const res = await itemAPI.getById(token, itemId);
        if (res.success) {
          setItem(res.data);
        } else {
          setError(res.message || "Item not found");
        }
      } catch {
        setError("Failed to load item");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [itemId]);

  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading item…</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (error || !item) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || "Item not found"}</AlertDescription>
            </Alert>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  const colors: any[] = item.colors || [];
  const variants: any[] = item.variants || [];
  const images: any[] = item.images || [];

  // Collect all color images for gallery fallback
  const allColorImages = colors.flatMap((c: any) => c.images || []);
  const galleryImages = images.length ? images : allColorImages;

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                onClick={() => router.push("/inventory-masters/items")}
                className="bg-red-700 text-white hover:bg-red-800"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Link href={`/inventory-masters/items/edit?id=${itemId}`}>
                <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Item
                </Button>
              </Link>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Left: Image gallery */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package2 className="h-4 w-4" /> Product Images
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ImageGallery images={galleryImages} />
                </CardContent>
              </Card>

              {/* Right: Basic info */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                        <Package2 className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl leading-tight">{item.itemName}</CardTitle>
                        <CardDescription className="mt-1">
                          {item.itemGroupName && (
                            <Badge variant="secondary" className="mr-1">{item.itemGroupName}</Badge>
                          )}
                          {item.brandName && (
                            <Badge variant="outline">{item.brandName}</Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <InfoRow label="Category" value={item.categoryName} />
                    <InfoRow label="UOM" value={item.uom} />
                    <InfoRow label="HSN Code" value={item.hsnCode} />
                    <InfoRow label="GST %" value={`${item.gst}%`} />
                    {item.hasDemoInstallation ? (
                      <div className="flex justify-between gap-4 py-2 border-b">
                        <span className="text-sm text-muted-foreground">Demo/Installation</span>
                        <Badge variant="secondary">Yes</Badge>
                      </div>
                    ) : null}
                    {item.description ? (
                      <div className="py-2 border-b">
                        <p className="text-sm font-medium mb-1">Description</p>
                        <div
                          className="text-sm text-muted-foreground whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: item.description }}
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Additional Info */}
                {(item.freeService || item.billPrintNote || item.warranty) && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ReceiptText className="h-4 w-4" /> Additional Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {item.freeService && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> Free Service
                          </p>
                          <p className="text-sm">{item.freeService}</p>
                        </div>
                      )}
                      {item.billPrintNote && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Tag className="h-3 w-3" /> Bill Print Note
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{item.billPrintNote}</p>
                        </div>
                      )}
                      {item.warranty && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Warranty
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{item.warranty}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Colors */}
            {colors.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Product Colors &amp; Images
                    <Badge variant="outline" className="ml-auto">{colors.length} color{colors.length !== 1 ? "s" : ""}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {colors.map((color: any, i: number) => (
                      <ColorCard key={color.id || i} color={color} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Variants Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Variants &amp; Pricing
                  <Badge variant="outline" className="ml-auto">{variants.length} variant{variants.length !== 1 ? "s" : ""}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: "900px" }}>
                    <thead>
                      <tr className="bg-red-700 text-white">
                        {["#", "Variant", "Opening Stock", "Min Qty", "Max MOP %", "Offer Price", "Stock Value", "Margin %", "Incentive %", "Max MOP Amt", "NLC"].map((h) => (
                          <th key={h} className="border border-red-600 px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v: any, i: number) => (
                        <tr key={v.id || i} className="hover:bg-muted/30 transition-colors">
                          <td className="border border-gray-200 px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                          <td className="border border-gray-200 px-3 py-2 font-medium">{v.variant || <span className="text-muted-foreground italic text-xs">—</span>}</td>
                          <td className="border border-gray-200 px-3 py-2">{Math.trunc(Number(v.openingStock))}</td>
                          <td className="border border-gray-200 px-3 py-2">{v.minimumQty || 0}</td>
                          <td className="border border-gray-200 px-3 py-2">{v.maxMOPPercent || 0}</td>
                          <td className="border border-gray-200 px-3 py-2">₹{v.offerPrice || 0}</td>
                          <td className="border border-gray-200 px-3 py-2">{Math.trunc(Number(v.stockValue))}</td>
                          <td className="border border-gray-200 px-3 py-2">{v.margin || 0}%</td>
                          <td className="border border-gray-200 px-3 py-2">{v.incentive || 0}%</td>
                          <td className="border border-gray-200 px-3 py-2">₹{v.maxMOPAmount || 0}</td>
                          <td className="border border-gray-200 px-3 py-2">₹{v.nlc || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}

export default function ItemViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      }
    >
      <ItemViewPageContent />
    </Suspense>
  );
}
