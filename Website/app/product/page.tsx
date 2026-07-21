import { Suspense } from "react";
import ProductDetail from "@/components/organisms/ProductDetail/ProductDetail";

export default function ProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductDetail />
    </Suspense>
  );
}
