import type { ReactNode } from "react";

export const metadata = {
  title: "NyayaLens",
  description: "Indian legal document intelligence platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
