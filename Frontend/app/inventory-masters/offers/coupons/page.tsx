"use client"

import { OffersListView } from "@/app/inventory-masters/offers/OffersListView"

export default function CouponsPage() {
  return (
    <OffersListView
      submodule={{
        title: "Exclusive Coupons",
        subtitle: "Coupon codes and product coupons shown on the website Offers page",
        sections: ["coupon"],
        addSection: "coupon",
      }}
    />
  )
}
