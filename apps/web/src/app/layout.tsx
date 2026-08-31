import type { ReactNode } from "react";
import { Source_Serif_4, Work_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/AuthProvider";
import "./globals.css";

// A clean modern sans for application chrome/UI, and a highly-readable
// editorial serif for sustained reading of document body text (Section 6)
// - both loaded as CSS variables so tailwind.config.ts's fontFamily
// tokens are the single place that decides where each is used.
const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata = {
  title: "NyayaLens",
  description: "Indian Legal Document Intelligence",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${workSans.variable} ${sourceSerif.variable}`}>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
