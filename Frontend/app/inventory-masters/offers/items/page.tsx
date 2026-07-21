"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function OfferItemsPage() {
  return (
    <OffersListView
      submodule={{
        title: "Offer Items",
        subtitle: "Featured product deals & flash sale items shown on the website",
        sections: ["flash_sale", "home_best"],
        addSection: "flash_sale",
      }}
    />
  )
}
