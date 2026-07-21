"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function ComboClearancePage() {
  return (
    <OffersListView
      submodule={{
        title: "Combo Deals & Clearance Sale",
        subtitle: "Product bundles and clearance items shown on the website Offers page",
        sections: ["combo", "clearance"],
        addSection: "combo",
      }}
    />
  )
}
