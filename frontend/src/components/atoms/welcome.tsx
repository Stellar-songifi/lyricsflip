import Image from 'next/image';
import { useTranslations } from 'next-intl';
import React from 'react';

const Welcome = () => {
  const t = useTranslations('home');
  const username = 'thetimileyin';

  return (
    <div className=" flex flex-col gap-5 md:gap-10 mb-6">
      <div className=" md:py-5 items-center flex justify-between md:border-b border-e-whiteSecondary2 ">
        <h2 className="text-gray font-interv text-sm md:text-[20px] font-normal leading-[32px]">
          {t('welcomeTitle')} 👋 {username}
        </h2>
        <div className="rounded-full border p-2.5 md:hidden border-e-whiteSecondary2 ">
          <Image
            src="/bell.svg"
            alt=""
            width={20}
            height={20}
            priority
            className="object-cover"
          />
        </div>
      </div>
      <h2 className=" text-textdark   font-interv  text-[14px] font-medium leading-[22px] tracking-[1.12px]">
        {t('modeHeader')}
      </h2>
    </div>
  );
};

export default Welcome;
