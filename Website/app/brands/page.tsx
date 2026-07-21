import { Suspense } from "react";
import BrandsPage from "@/components/organisms/BrandsPage/BrandsPage";

export default function Brands() {
  return (
    <Suspense fallback={null}>
      <BrandsPage />
    </Suspense>
  );
}
