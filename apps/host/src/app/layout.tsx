import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Volatility Engine — Global Trivia Exchange",
  description: "Host broadsheet and trading floor for the Volatility Engine trivia game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${ibmPlexMono.variable}`}>
      <body className="antialiased bg-[#F1ECDE] text-[#1A1A18] selection:bg-[#1B4B5A] selection:text-[#F1ECDE]">
        {children}
      </body>
    </html>
  );
}
