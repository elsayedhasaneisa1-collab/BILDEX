import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic, Outfit, Syne } from "next/font/google";
import { getLang } from "@/lib/lang";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-display" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-body" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "BUILDEX — Build Beyond Limits", template: "%s · BUILDEX" },
  description: "Build, design, animate, and publish websites without code. Templates, a visual studio, and a designer marketplace with real review.",
  applicationName: "BUILDEX",
  openGraph: { title: "BUILDEX — Build Beyond Limits", description: "A website studio with templates, motion, and publishing.", images: ["/images/og.png"] },
  twitter: { card: "summary_large_image", images: ["/images/og.png"] },
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={`${syne.variable} ${outfit.variable} ${arabic.variable}`}>
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <div id="top" />
        {children}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
      </body>
    </html>
  );
}
