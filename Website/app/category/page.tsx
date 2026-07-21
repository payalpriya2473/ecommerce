import { Suspense } from "react";
import CategoryPage from "@/components/organisms/CategoryPage/CategoryPage";

export default function Category() {
  return (
    <Suspense fallback={null}>
      <CategoryPage />
    </Suspense>
  );
}
