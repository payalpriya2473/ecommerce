"use client";

import { CartProvider } from "@/lib/cart/cart-context";
import { AccountProvider } from "@/lib/account/account-context";
import { WishlistProvider } from "@/lib/wishlist/wishlist-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <WishlistProvider>
        <AccountProvider>{children}</AccountProvider>
      </WishlistProvider>
    </CartProvider>
  );
}
