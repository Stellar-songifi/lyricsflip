'use client';

import Link from 'next/link';
import React from 'react';
import { Settings, Sun, Moon } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { FiHome, FiCreditCard, FiGrid } from 'react-icons/fi';
import { IoTrophyOutline } from 'react-icons/io5';
import { useThemeStore } from '@/store/useThemeStore';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { WalletButton } from './wallet-button';
import { WalletStatusBanner } from './wallet-status-banner';

// Navigation items array — profile href is dynamic (resolved in the component)
const staticNavItems = [
  { href: '/', label: 'Home' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/more', label: 'More' },
];
const mobileNavItems = [
  {
    href: '/',
    label: 'Home',
    icon: <FiHome className="h-6 w-6" />,
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: <FiCreditCard className="h-6 w-6" />,
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    icon: <IoTrophyOutline className="h-6 w-6" />,
  },
  {
    href: '/more',
    label: 'More',
    icon: <FiGrid className="h-6 w-6" />,
  },
];

const Navbar = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useThemeStore();
  const { account } = useStellar();

  // Build nav items with a dynamic profile link
  const navItems = [
    ...staticNavItems.slice(0, 4),
    {
      href: account?.address ? `/profile/${account.address}` : '/set-username',
      label: 'Profile',
    },
    staticNavItems[staticNavItems.length - 1],
  ];

  return (
    <div>
      <header className="hidden md:flex max-w-[1440px] top-0 mx-auto px-20 py-7 fixed inset-x-0 justify-center items-center bg-white dark:bg-gray-900 border-b-[0.75px] border-whiteSecondary2 dark:border-gray-700 z-50">
        <div className="flex-1 flex items-center">
          <div className="flex justify-center items-center pr-5 border-r border-whiteSecondary2 dark:border-gray-700">
            <Image
              src="/Logo.svg"
              alt="logo"
              width={126}
              height={42}
              priority
              className="object-cover"
            />
          </div>
          <nav className="ml-5 py-2">
            <ul className="gap-10 md:hidden lg:flex">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`text-center font-interv text-base font-normal leading-6 transition-colors ${
                        isActive
                          ? 'text-purplePrimary5'
                          : 'text-gray dark:text-gray-300 hover:text-purplePrimary5 dark:hover:text-purplePrimary5'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex w-10 h-10 p-2 justify-center items-center aspect-square rounded border border-[#DBE2E8] dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 text-yellow-400" />
            ) : (
              <Moon className="h-5 w-5 text-gray-600" />
            )}
          </button>

          <div className="flex w-10 h-10 p-2 justify-center items-center aspect-square rounded border border-[#DBE2E8] dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Settings className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </div>

          <WalletButton />
        </div>
        <WalletStatusBanner className="absolute top-full inset-x-0" />
      </header>
    </div>
  );
};

export default Navbar;

export const MobileNav = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <>
    <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-white dark:bg-gray-900 border-b dark:border-gray-700">
      <div className="flex justify-end px-4 py-2">
        <WalletButton />
      </div>
      <WalletStatusBanner />
    </div>
    <nav className="md:hidden flex items-center justify-around border-t dark:border-gray-700 py-3 fixed bottom-0 z-50 inset-x-0 bg-white dark:bg-gray-900">
      {mobileNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center transition-colors ${
              isActive
                ? 'text-purplePrimary5'
                : 'text-[#909090] dark:text-gray-400 hover:text-purplePrimary5 dark:hover:text-purplePrimary5'
            }`}
          >
            {item.icon}
            <span className="text-xs mt-1 font-interv">{item.label}</span>
          </Link>
        );
      })}
      {/* Dark mode toggle on mobile nav */}
      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex flex-col items-center text-[#909090] dark:text-gray-400 hover:text-purplePrimary5 dark:hover:text-purplePrimary5 transition-colors"
      >
        {theme === 'dark' ? (
          <Sun className="h-6 w-6 text-yellow-400" />
        ) : (
          <Moon className="h-6 w-6" />
        )}
        <span className="text-xs mt-1 font-interv">Theme</span>
      </button>
    </nav>
    </>
  );
};
