"use client"
import Navbar, { MobileNav } from '@/components/molecules/navbar';
import { metadata } from "./metadata";
import { ClientProvider } from '@/components/providers/client-provider';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const interV = localFont({
  src: '../fonts/inter-v.ttf',
  variable: '--font-interv',
});

const DynamicStellarProvider = dynamic(() => import('@/lib/stellar/StellarProvider').then(mod => mod.StellarProvider), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Loading Game Engine...</h2>
        <p className="text-gray-500">Please wait while we initialize the game</p>
      </div>
    </div>
  ),
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetBrainsMono.variable} ${interV.variable} antialiased`}>
        <ClientProvider>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Loading...</h2>
                <p className="text-gray-500">Please wait while we prepare the game</p>
              </div>
            </div>
          }>
            <DynamicStellarProvider>
              <Navbar />
              {/* pb-20 on mobile so the fixed MobileNav bar never overlaps content; md:pb-0 restores normal flow on desktop */}
              <main className="pb-20 md:pb-0">
                {children}
              </main>
              <MobileNav />
            </DynamicStellarProvider>
          </Suspense>
          <Toaster richColors position="top-center" />
        </ClientProvider>
      </body>
    </html>
  );
}
