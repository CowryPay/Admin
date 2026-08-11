import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CowryPay Admin",
  description: "Internal ops and investor dashboard for CowryPay.",
  // Internal tool behind a shared key — keep it out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0B0B",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-cowry-dark font-sans text-white antialiased">{children}</body>
    </html>
  );
}
