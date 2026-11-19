"use client";
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export default function SignUpPage() {
  const t = useTranslations('wallet');
  const wallets = {
    argent: t('wallets.argent'),
    okx: t('wallets.okx'),
    braavos: t('wallets.braavos'),
  };

  return (
    <div className="flex h-screen">
      {/* Left Column - Sign Up Form */}
      <div className=" bg-white flex w-full flex-col justify-center px-8 md:w-1/2 md:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-[#090909] text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {t('title')}
          </h1>
          <p className="text-[#121212] mt-4 text-sm text-muted-foreground md:text-base">
            {t('subtitle')}
          </p>

          <div className="mt-8 space-y-4">
            <button className="bg-[#DBE1E7] cursor-pointer text-[#090909] rounded-full flex w-full items-center justify-center gap-2 py-6">
              <Image
                src="/image3.png"
                width={24}
                height={24}
                alt="Argent logo"
                className="h-6 w-6"
              />
              <span>{t('continueWith', { wallet: wallets.argent })}</span>
            </button>

            <button className="bg-[#DBE1E7] cursor-pointer text-[#090909] rounded-full flex w-full items-center justify-center gap-2 py-6">
              <Image
                src="/image2.png"
                width={24}
                height={24}
                alt="OKX logo"
                className="h-6 w-6"
              />
              <span>{t('continueWith', { wallet: wallets.okx })}</span>
            </button>

            <button className="bg-[#DBE1E7] cursor-pointer text-[#090909] rounded-full flex w-full items-center justify-center gap-2 py-6">
              <Image
                src="/image1.png"
                width={24}
                height={24}
                alt="Braavos logo"
                className="h-6 w-6"
              />
              <span>{t('continueWith', { wallet: wallets.braavos })}</span>
            </button>
          </div>

          <div className="relative mt-8 flex items-center justify-center">
            <span className="bg-[#DBE1E7] w-full h-[1px]"></span>
            <span className="text-[#666666] mr px-2 text-muted-foreground">
              {t('or')}
            </span>
            <span className="bg-[#DBE1E7] w-full h-[1px]"></span>
          </div>
        <div className="mt-8 w-full mx-auto">
          <button className="mt-8 w-full cursor-pointer rounded-full bg-purple-600 py-6 hover:bg-purple-700">
            {t('connectWallet')}
          </button>
        </div>
        </div>
      </div>

      {/* Right Column - Brand */}
      <div className="hidden bg-purple-600 md:flex md:w-1/2 md:flex-col md:items-center md:justify-center">
        <div className="text-4xl font-bold md:text-5xl lg:text-6xl">
          <span className="text-white">{t('brandLyric')}</span>
          <span className="text-cyan-300">{t('brandFlip')}</span>
        </div>
      </div>
    </div>
  );
}
