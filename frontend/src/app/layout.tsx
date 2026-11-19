import Navbar, { MobileNav } from '@/components/molecules/navbar';
import { ClientProvider } from '@/components/providers/client-provider';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
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

/** Loading fallback while the Stellar provider (loaded lazily) initializes. */
function EngineLoading() {
  const t = useTranslations('errors');
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">{t('loadingEngine')}</h2>
        <p className="text-gray-500">{t('initializing')}</p>
      </div>
    </div>
  );
}

/** Suspense fallback while the page prepares. */
function GameLoading() {
  const t = useTranslations('errors');
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">{t('loading')}</h2>
        <p className="text-gray-500">{t('preparing')}</p>
      </div>
    </div>
  );
}

const DynamicStellarProvider = dynamic(() => import('@/lib/stellar/StellarProvider').then(mod => mod.StellarProvider), {
  ssr: false,
  loading: EngineLoading,
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
            <Suspense fallback={<GameLoading />}>
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
