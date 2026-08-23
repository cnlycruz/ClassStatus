import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClassStatus NCR | Metro Manila Class Suspension Tracker (May Pasok Ba?)",
  description:
    "Real-time interactive class suspension status for all 17 Metro Manila (NCR) cities and municipalities. Check whether classes are suspended today or tomorrow with verified official LGU sources.",
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
  authors: [{ name: "ClassStatus NCR Team" }],
  openGraph: {
    title: "ClassStatus NCR | May Pasok Ba?",
    description: "Live interactive class suspension tracker for all 17 Metro Manila cities and municipalities.",
    type: "website",
    locale: "en_PH",
  },
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
