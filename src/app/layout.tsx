import type { Metadata, Viewport } from "next";
import { DM_Mono, Fraunces, Instrument_Sans } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { PaintedSky } from "@/components/painted-sky";
import "./globals.css";

// SOFT and WONK are the wordmark's: rounder serifs and Fraunces' leaning italic letters.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "WONK", "opsz"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Dreamscape",
  description: "Your brain deletes your dreams. Dreamscape keeps them.",
  applicationName: "Dreamscape",
  appleWebApp: { capable: true, title: "Dreamscape", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f0c1c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PaintedSky />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
