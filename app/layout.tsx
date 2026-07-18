import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Kredex — Reputation-Based Micro-Lending on Stellar",
  description:
    "Kredex is a decentralized micro-lending marketplace on Stellar that empowers gig workers and freelancers in emerging markets to access credit based on real financial behavior — not collateral or credit history.",
  keywords: [
    "Kredex",
    "micro-lending",
    "DeFi",
    "blockchain",
    "Stellar",
    "Soroban",
    "reputation score",
    "unbanked",
    "gig economy",
    "XLM lending",
    "defi",
    "crypto loans",
  ],
  authors: [{ name: "Kredex" }],
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Kredex — Reputation-Based Micro-Lending",
    description:
      "Access credit based on real financial behavior. 1.7 billion unbanked adults deserve better.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Kredex Logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kredex — Reputation-Based Micro-Lending",
    description: "Decentralized micro-lending powered by on-chain reputation. Built on Stellar.",
  },
};

import { WalkthroughOverlay } from "@/components/walkthrough/WalkthroughOverlay";
import { AlertProvider } from "@/components/ui/AlertProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} flex w-full min-h-full flex-col antialiased`}
        style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
        suppressHydrationWarning
      >
        <AlertProvider>
          {children}
          <WalkthroughOverlay />
        </AlertProvider>
        <Analytics />
      </body>
    </html>
  );
}
