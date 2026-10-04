import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Causewayside",
  description: "Routes you can actually complete, worked out for how you get around.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ebe5" },
    { media: "(prefers-color-scheme: dark)", color: "#141816" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="manifest" href="manifest.webmanifest" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Atkinson+Hyperlegible+Mono:wght@400;600&display=swap" />
      </head>
      <body>
        {children}
        {/* Offline support where the host allows service workers (not inside embedded previews). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator && window.top === window.self && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function(){});`,
          }}
        />
      </body>
    </html>
  );
}
