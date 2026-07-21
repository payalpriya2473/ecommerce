"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function OffersIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/inventory-masters/offers/items")
  }, [router])
  return null
}
