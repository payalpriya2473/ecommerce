"use client";

import { Suspense } from "react";
import IncentiveViewContent from "./IncentiveViewContent";

export default function IncentiveViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <IncentiveViewContent />
    </Suspense>
  );
}