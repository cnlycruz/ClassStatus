import type { Metadata } from "next";
import Image from "next/image";
import { InstallGuide } from "@/components/InstallGuide";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Install ClassStatus | Class Status NCR",
  description: "Install ClassStatus for quick access to Metro Manila class suspension updates.",
};

export default function InstallPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <Image
            src="/icons/class-status-icon-192.png"
            alt="ClassStatus app icon"
            width={72}
            height={72}
            priority
            className="mx-auto rounded-2xl shadow-md ring-1 ring-slate-200 dark:ring-slate-700"
          />
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Install ClassStatus</h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Keep ClassStatus on your home screen for quick access to class suspension updates.
          </p>
        </header>
        <InstallGuide />
      </main>
      <Footer />
    </div>
  );
}
