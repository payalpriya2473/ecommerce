"use client";

import { Suspense } from "react";
import ProcurementContent from "./ProcurementContent";

export default function ProcurementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ProcurementContent />
    </Suspense>
  );
}
