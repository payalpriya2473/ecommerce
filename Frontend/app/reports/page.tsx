"use client";

import Link from "next/link";
import { BarChart3, Boxes, ChevronRight } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";

// Add new reports here (and in services/reports/index.js on the backend).
const REPORTS = [
  {
    href: "/reports/sales",
    title: "Sales Report",
    description: "Showroom invoices and website orders — bills, item lines and day/month summaries with GST and totals.",
    icon: BarChart3,
  },
  {
    href: "/reports/items",
    title: "Item Report",
    description: "Every item with prices, current stock and value, units sold, sales value and non-moving stock.",
    icon: Boxes,
  },
];

export default function ReportsIndexPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1 mb-8">Filter, analyse and export business data</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {REPORTS.map((r) => (
              <Link key={r.href} href={r.href}>
                <Card className="h-full border-border/50 shadow-sm hover:shadow-md hover:border-primary/40 transition-all">
                  <CardContent className="p-6 flex gap-4">
                    <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                      <r.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold flex items-center justify-between">
                        {r.title} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
