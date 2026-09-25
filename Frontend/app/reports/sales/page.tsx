"use client";

import { Suspense } from "react";
import SalesReportContent from "./SalesReportContent";

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <SalesReportContent />
    </Suspense>
  );
}
