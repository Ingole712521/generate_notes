import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF2Notes Pro — Condense PDFs into Structured Notes",
  description:
    "Upload a PDF, get AI-condensed structured short notes, and download a polished two-page A4 PDF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-paper min-h-screen">{children}</body>
    </html>
  );
}
