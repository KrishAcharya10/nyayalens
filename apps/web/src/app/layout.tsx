import type { ReactNode } from "react";
// A clean modern sans for application chrome/UI, and a highly-readable
// editorial serif for sustained reading of document body text (Section 6).
// Self-hosted from npm (not next/font/google, which fetches from Google at
// build/dev time) so the app runs with no network access. globals.css maps
// them onto --font-sans/--font-serif, which tailwind.config.ts's
// fontFamily tokens read.
import "@fontsource-variable/work-sans";
import "@fontsource-variable/source-serif-4";
import { AuthProvider } from "@/lib/AuthProvider";
import "./globals.css";

export const metadata = {
  title: "NyayaLens",
  description: "Indian Legal Document Intelligence",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
