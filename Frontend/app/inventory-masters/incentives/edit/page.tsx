"use client";

import { Suspense } from "react";
import IncentiveEditContent from "./IncentiveEditContent";

export default function IncentiveEditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <IncentiveEditContent />
    </Suspense>
  );
}