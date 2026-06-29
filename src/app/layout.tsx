import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaRuntime } from "@/components/pwa";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Gravador",
  title: "Gravador",
  description: "Gravação de áudio por workspace (nome provisório).",
  // PWA no iOS: app standalone + título curto na tela de início. (manifest é auto-linkado pelo Next.)
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Gravador" },
  formatDetection: { telephone: false },
};

// theme-color por esquema → casa a barra do navegador com a superfície do app (≈ tokens do globals.css).
// viewportFit cover ajuda em telas com notch quando instalado em standalone.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#111219" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-br"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          <PwaRuntime />
        </ThemeProvider>
      </body>
    </html>
  );
}
