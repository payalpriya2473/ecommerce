import type { Metadata } from "next";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import "./globals.css";
import Providers from "./providers";
import StorefrontHeader from "@/components/layout/StorefrontHeader";

export const metadata: Metadata = {
  title: "Motabhai Electronics",
  description: "A modern electronics storefront built with Next.js and React.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={
        {
          "--font-inter":
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          "--font-poppins":
            '"Segoe UI", "Trebuchet MS", "Arial Narrow", system-ui, sans-serif',
        } as CSSProperties
      }
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>
          <Suspense fallback={null}>
            <StorefrontHeader />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
