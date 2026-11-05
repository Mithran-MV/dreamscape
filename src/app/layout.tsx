import type { Metadata, Viewport } from "next";
import { DM_Mono, Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"] });
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
