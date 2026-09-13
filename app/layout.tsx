import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider, ToastProvider } from "@/lib/client";
import { SWRegister } from "@/components/pwa";

export const metadata: Metadata = {
  title: "MEMORE — Don't Like. Invest.",
  description: "Double-tap memes to invest Aura. Find the next big meme before everyone else. More memes. More wins.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MEMORE" },
  icons: { icon: "/icons/icon-32.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Patrick+Hand&family=Shantell+Sans:wght@500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.dataset.theme="dark";`,
          }}
        />
      </head>
      <body className="antialiased">
        <SessionProvider>
          <ToastProvider>

            {children}
            <SWRegister />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
