import { Suspense } from "react";
import SearchPage from "@/components/organisms/Searchpage/Searchpage";

export default function SearchPageRoute() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
