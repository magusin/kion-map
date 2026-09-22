import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kion Map",
  description: "Cartographie des équipements informatiques",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
