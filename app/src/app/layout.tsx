import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";

import "@theme/index.css";

import { HorizonBackdrop } from "@/components/horizon/HorizonBackdrop";
import { Chrome } from "@/components/shell/Chrome";
import { ThemeScript } from "@/components/shell/ThemeScript";

import { Providers } from "./providers";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Horizon", template: "%s · Horizon" },
  description: "Local-first eval cockpit for HUD environments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>
          <HorizonBackdrop />
          <Chrome>{children}</Chrome>
        </Providers>
      </body>
    </html>
  );
}
