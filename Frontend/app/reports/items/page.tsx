"use client";

import { Suspense } from "react";
import ItemReportContent from "./ItemReportContent";

export default function ItemReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ItemReportContent />
    </Suspense>
  );
}
