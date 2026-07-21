"use client";

import { Suspense } from "react";
import ColorEditPageContent from "./ColorEditPageContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <ColorEditPageContent />
    </Suspense>
  );
}