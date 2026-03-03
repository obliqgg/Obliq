import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: ">_",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={jetbrainsMono.className}>
        <div
          dangerouslySetInnerHTML={{
            __html: "<!-- NOCTIS LABS \u2014 INTERNAL BUILD 3301 -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
