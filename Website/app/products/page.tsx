import { Suspense } from "react";
import CategoryPage from "@/components/organisms/CategoryPage/CategoryPage";

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <CategoryPage />
    </Suspense>
  );
}
