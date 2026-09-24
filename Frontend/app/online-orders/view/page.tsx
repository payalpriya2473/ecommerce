"use client";

import { Suspense } from "react";
import OnlineOrderViewContent from "./OnlineOrderViewContent";

export default function OnlineOrderViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <OnlineOrderViewContent />
    </Suspense>
  );
}
