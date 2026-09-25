"use client";

import { Suspense } from "react";
import SalesOverviewContent from "./SalesOverviewContent";

export default function AnalyticsOverviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <SalesOverviewContent />
    </Suspense>
  );
}
