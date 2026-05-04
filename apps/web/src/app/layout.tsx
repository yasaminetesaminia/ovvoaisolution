import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Lavora — AI Receptionist",
  description: "Where Science, Beauty, and Longevity Meet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-brand-50 text-neutral-900 min-h-screen">{children}</body>
    </html>
  );
}
