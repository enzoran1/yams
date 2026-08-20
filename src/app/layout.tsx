import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Yams",
  description: "Feuille de score mobile pour tes parties de Super Yams."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

