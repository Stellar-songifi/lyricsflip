'use client';

import { AdminCards } from "@/components/organisms/AdminCards";
import { AdminConfig } from "@/components/organisms/AdminConfig";
import { AdminRoles } from "@/components/organisms/AdminRoles";
import { useStellar } from "@/lib/stellar/hooks/useStellar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const REDIRECT_DELAY_MS = 2000;

export default function AdminPage() {
  const { account, systemCalls } = useStellar();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!account) {
      router.push('/');
      return;
    }
    if (!systemCalls) return;

    let cancelled = false;
    setIsAdmin(null);
    systemCalls
      .isAdmin(account.address)
      .catch(() => false)
      .then((result) => {
        if (!cancelled) setIsAdmin(result);
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
        <p className="text-gray-600">Checking admin access...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <div
        role="alert"
        className="fixed top-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-3 text-white shadow-lg"
      >
        Admin access required. Redirecting...
      </div>
    );
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <AdminConfig />
      <AdminCards />
      <AdminRoles />
    </main>
  );
}
