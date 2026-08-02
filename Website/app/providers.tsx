"use client";

import { CartProvider } from "@/lib/cart/cart-context";
import { AccountProvider } from "@/lib/account/account-context";
import { WishlistProvider } from "@/lib/wishlist/wishlist-context";
import { ThemeProvider } from "@/lib/theme/theme-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>
        <WishlistProvider>
          <AccountProvider>{children}</AccountProvider>
        </WishlistProvider>
      </CartProvider>
    </ThemeProvider>
  );
}
