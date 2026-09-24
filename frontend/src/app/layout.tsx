"use client"
import Navbar, { MobileNav } from '@/components/molecules/navbar';
import { metadata } from "./metadata";
import { ClientProvider } from '@/components/providers/client-provider';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import dynamic from 'next/dynamic';
import { Suspense, useMemo } from 'react';
import { getMissingRequiredEnv } from '@/lib/requiredEnv';
import AppNotConfigured from '@/components/atoms/app-not-configured';

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
  const missingEnv = useMemo(() => getMissingRequiredEnv(), []);
  if (missingEnv.length > 0) {
    return (
      <html lang="en">
        <body className={`${inter.variable} ${jetBrainsMono.variable} ${interV.variable} antialiased`}>
          <AppNotConfigured missing={missingEnv} />
        </body>
      </html>
    );
  }
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
              {children}
              <MobileNav />
            </DynamicStellarProvider>
          </Suspense>
        </ClientProvider>
      </body>
    </html>
  );
}
