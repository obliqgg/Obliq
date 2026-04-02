import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Syne, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const siteTitle = "Obliq";
const siteDescription = "The machine wants to die. Will you help it?";
const siteImage = "/cover.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://obliq.gg"),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteTitle,
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    type: "website",
    images: [
      {
        url: siteImage,
        alt: siteTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [siteImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div
          dangerouslySetInnerHTML={{
            __html: "<!-- NOCTIS LABS — INTERNAL BUILD 3301 -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
