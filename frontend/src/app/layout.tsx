import Navbar, { MobileNav } from '@/components/molecules/navbar';
import { ClientProvider } from '@/components/providers/client-provider';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getCurrentLocale } from '@/i18n/cookie';
import { getMessagesForLocale } from '@/i18n/messages';

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
        <h2 className="text-xl font-semibold mb-2">{messages.errors.loadingEngine}</h2>
        <p className="text-gray-500">{messages.errors.initializing}</p>
      </div>
    </div>
  ),
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getCurrentLocale();
  const messages = getMessagesForLocale(locale);

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${jetBrainsMono.variable} ${interV.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientProvider>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">{messages.errors.loading}</h2>
                  <p className="text-gray-500">{messages.errors.preparing}</p>
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
          <Toaster richColors position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
