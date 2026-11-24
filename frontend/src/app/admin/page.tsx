'use client';

import { AdminCards } from "@/components/organisms/admin-cards";
import { AdminConfig } from "@/components/organisms/admin-config";
import { AdminRoles } from "@/components/organisms/admin-roles";
import { OwnerSettings } from "@/components/organisms/owner-settings";
import { useStellar } from "@/lib/stellar/hooks/use-stellar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';

const REDIRECT_DELAY_MS = 2000;

type AdminTab = 'admin' | 'owner';

export default function AdminPage() {
  const t = useTranslations('admin');
  const { account, systemCalls } = useStellar();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('admin');

  useEffect(() => {
    if (!account) {
      router.push('/');
      return;
    }
    if (!systemCalls) return;

    let cancelled = false;
    setIsAdmin(null);
    setIsOwner(null);
    systemCalls
      .isAdmin(account.address)
      .catch(() => false)
      .then((result) => {
        if (!cancelled) setIsAdmin(result);
      });
    systemCalls
      .isOwner(account.address)
      .catch(() => false)
      .then((result) => {
        if (!cancelled) setIsOwner(result);
      });
    return () => {
      cancelled = true;
    };
  }, [account, systemCalls, router]);

  useEffect(() => {
    if (isAdmin !== false) return;
    const timer = setTimeout(() => router.push('/'), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAdmin, router]);

  if (!account) {
    return null;
  }

  if (isAdmin === null) {
    return (
      <main className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <p className="text-gray-600">{t('checkingAccess')}</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <div
        role="alert"
        className="fixed top-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-3 text-white shadow-lg"
      >
        {t('accessRequired')}
      </div>
    );
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('dashboard')}</h1>
      {isOwner && (
        <div role="tablist" className="mb-4 flex gap-2 border-b">
          <button
            role="tab"
            aria-selected={activeTab === 'admin'}
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 ${activeTab === 'admin' ? 'border-b-2 border-blue-600 font-semibold' : 'text-gray-600'}`}
          >
            Admin
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'owner'}
            onClick={() => setActiveTab('owner')}
            className={`px-4 py-2 ${activeTab === 'owner' ? 'border-b-2 border-blue-600 font-semibold' : 'text-gray-600'}`}
          >
            Owner
          </button>
        </div>
      )}
      {isOwner && activeTab === 'owner' ? (
        <OwnerSettings isOwner walletAddress={account?.address ?? null} />
      ) : (
        <>
          <AdminConfig />
          <AdminCards />
          <AdminRoles />
        </>
      )}
    </main>
  );
}
