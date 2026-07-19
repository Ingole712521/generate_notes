import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF2Notes Pro — UPSC Mains Q&A Quick Revision",
  description:
    "Upload a PDF and get UPSC Mains-ready Q&A notes with answer frameworks, data tables, memory cues, and flowcharts—download as a revision PDF.",
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
