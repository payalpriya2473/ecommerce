import type { Metadata } from "next";
import AboutPage from "@/components/organisms/Aboutpage/Aboutpage";

export const metadata: Metadata = {
  title: "About Us — AppleNext Electronics",
  description:
    "Genuine stock, honest pricing and support that stays reachable. The story behind AppleNext Electronics, what we sell, and what we promise on every order.",
};

export default function AboutPageRoute() {
  return <AboutPage />;
}
