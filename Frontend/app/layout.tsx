import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PermissionProvider } from "@/contexts/Permissionprovider";
import { SessionProvider } from "@/components/session-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AppleNext Enterprise Suite",
  description:
    "Comprehensive multi-tenant ERP solution for managing companies, inventory, employees, and operations",
  generator: "v0.app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="font-sans">
        <PermissionProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </PermissionProvider>
      </body>
    </html>
  );
}
