"use client";

import { Suspense } from "react";
import SalesInvoiceEditContent from "./SalesInvoiceEditContent";

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function SalesInvoiceEditPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SalesInvoiceEditContent />
    </Suspense>
  );
}