import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { ThemeProvider } from '@/components/providers/theme-provider';
import ClientShell from './client-shell';
import './globals.css';

export { metadata } from './metadata';

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('common');

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* Inline script runs before paint to avoid a flash of wrong theme */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('lyricsflip-theme');var t=s?JSON.parse(s).state?.theme:null;if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetBrainsMono.variable} ${interV.variable} antialiased bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <h2 className="text-xl font-semibold mb-2">
                      {t('loading')}
                    </h2>
                    <p className="text-gray-500">{t('pleaseWait')}</p>
                  </div>
                </div>
              }
            >
              <ClientShell>{children}</ClientShell>
            </Suspense>
            <Toaster richColors position="top-center" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
