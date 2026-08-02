"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function ExchangeOffersPage() {
  return (
    <OffersListView
      submodule={{
        title: "Exchange Offers",
        subtitle: "Old-device exchange bonuses shown on the website Offers page and homepage",
        sections: ["exchange_offer"],
        addSection: "exchange_offer",
        showOfferPrice: false,
      }}
    />
  )
}
