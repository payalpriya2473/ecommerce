"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function BrandDealsPage() {
  return (
    <OffersListView
      submodule={{
        title: "Brand Deals",
        subtitle: "Brand-specific product deals shown on the website Offers page",
        sections: ["brand_deal"],
        addSection: "brand_deal",
      }}
    />
  )
}
