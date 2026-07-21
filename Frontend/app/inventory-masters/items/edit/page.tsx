"use client"

import { Suspense } from "react"
import ItemEditPageContent from "./ItemEditPageContent"

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <ItemEditPageContent />
    </Suspense>
  )
}