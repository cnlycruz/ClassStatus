import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeProvider } from "@/components/ThemeContext";
import { ThemeFavicon } from "@/components/ThemeFavicon";
import { PublicRealtimeBridge } from "@/components/PublicRealtimeBridge";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Class Status NCR | Metro Manila Class Suspension Tracker (May Pasok Ba?)",
  description:
    "Real-time interactive class suspension status for all 17 Metro Manila (NCR) cities and municipalities. Check whether classes are suspended today or tomorrow with verified official LGU sources.",
  applicationName: "Class Status NCR",
  manifest: "/manifest.webmanifest",
  keywords: [
    "walang pasok",
    "may pasok ba",
    "metro manila class suspension",
    "ncr class suspension",
    "class suspension manila",
    "class suspension quezon city",
    "bagyo suspension",
    "deped ncr",
  ],
  authors: [{ name: "Class Status NCR Team" }],
  icons: {
    icon: [
      { url: "/icons/class-status-favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/class-status-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/class-status-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icons/class-status-favicon.png",
    apple: [{ url: "/icons/class-status-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Class Status NCR",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Class Status NCR | May Pasok Ba?",
    description: "Live interactive class suspension tracker for all 17 Metro Manila cities and municipalities.",
    type: "website",
    locale: "en_PH",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200">
        <ThemeProvider>
          <ThemeFavicon />
          <PublicRealtimeBridge />
          {children}
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
