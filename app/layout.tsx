import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://kredex.vercel.app/"),
  title: "KRedex — Secure and Easy P2P Lending and Borrowing",
  description:
    "KRedex is a decentralized micro-lending marketplace that empowers users to access secure and easy P2P lending and borrowing based on trust.",
  keywords: [
    "KRedex",
    "micro-lending",
    "DeFi",
    "blockchain",
    "Stellar",
    "reputation score",
    "unbanked",
    "gig economy",
    "crypto lending",
    "P2P lending"
  ],
  authors: [{ name: "KRedex" }],
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "KRedex — Secure and Easy P2P Lending and Borrowing",
    description:
      "Access credit based on real financial behavior and trust.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "KRedex Logo" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`} data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col antialiased" style={{ background: "#06060a" }}>
        {children}
      </body>
    </html>
  );
}
