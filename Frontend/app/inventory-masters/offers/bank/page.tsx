"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function BankOffersPage() {
  return (
    <OffersListView
      submodule={{
        title: "Bank & Card Offers",
        subtitle: "Bank and card discounts shown on the website Offers page",
        sections: ["bank_offer"],
        addSection: "bank_offer",
      }}
    />
  )
}
