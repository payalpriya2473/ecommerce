"use client";

import { Suspense } from "react";
import SalesInvoiceViewContent from "./SalesInvoiceViewContent";

export default function SalesInvoiceViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <SalesInvoiceViewContent />
    </Suspense>
  );
}