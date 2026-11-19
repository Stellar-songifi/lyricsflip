'use client'

import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

type NotificationCategory = 'all' | 'mentions' | 'system'

interface NotificationItem {
  id: string
  title: string
  message: string
  timeAgo: string
  unread: boolean
  category: NotificationCategory
  icon?: string
}

const sampleNotifications: NotificationItem[] = [
  {
    id: '1',
    title: 'New Challenge Invite',
    message: 'Alex invited you to a wager match. Streaks are on the line!',
    timeAgo: '2m',
    unread: true,
    category: 'all',
    icon: '/join.svg',
  },
  {
    id: '2',
    title: 'You were mentioned',
    message: '“@you crushed that last round!” – from the global chat',
    timeAgo: '15m',
    unread: true,
    category: 'mentions',
    icon: '/cardline.svg',
  },
  {
    id: '3',
    title: 'System Update',
    message: 'Multiplier odds updated for quick matches. See what’s new.',
    timeAgo: '1h',
    unread: false,
    category: 'system',
    icon: '/card2line.svg',
  },
  {
    id: '4',
    title: 'Leaderboard Movement',
    message: 'You moved up to rank #18. Keep the tempo going!',
    timeAgo: '3h',
    unread: false,
    category: 'all',
    icon: '/trophy.png',
  },
]

export default function NotificationsPage() {
  const t = useTranslations('notifications')
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all')
  const [items, setItems] = useState<NotificationItem[]>(sampleNotifications)

  const filtered = useMemo(() => {
    if (activeTab === 'all') return items
    return items.filter(n => n.category === activeTab)
  }, [activeTab, items])

  const unreadCount = useMemo(() => items.filter(n => n.unread).length, [items])

  const handleMarkAllAsRead = () => {
    setItems(prev => prev.map(n => ({ ...n, unread: false })))
  }

  const handleDismiss = (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
  }

  return (
    <main className="max-w-[1440px] mx-auto pt-24 px-5 md:px-20 pb-28 md:pb-16">
      <div className="flex items-center justify-between mb-6 md:mb-10">
        <div className="flex items-center gap-3">
          <div className="rounded-full border p-2.5 border-e-whiteSecondary2 ">
            <Image src="/bell.svg" alt="bell" width={20} height={20} priority className="object-cover" />
          </div>
          <h1 className="text-textdark font-interv text-xl md:text-2xl font-semibold">{t('title')}</h1>
          {unreadCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-purplePrimary5/10 text-purplePrimary5 text-xs px-2 py-0.5">
              {t('unreadCount', { count: unreadCount })}
            </span>
          )}
        </div>

        <button
          onClick={handleMarkAllAsRead}
          className="text-sm text-purplePrimary5 hover:underline"
        >
          {t('markAllAsRead')}
        </button>
      </div>

      <div className="flex items-center gap-2 md:gap-3 mb-5 md:mb-8">
        {([
          { id: 'all', label: 'All' },
          { id: 'mentions', label: 'Mentions' },
          { id: 'system', label: 'System' },
        ] as { id: NotificationCategory; label: string }[]).map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                isActive
                  ? 'bg-purplePrimary5 text-white border-purplePrimary5'
                  : 'bg-white text-[#909090] border-whiteSecondary2 hover:text-textdark'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-white">
          <Image src="/Noise.png" alt="empty" width={64} height={64} className="opacity-60" />
          <p className="mt-4 text-sm text-[#909090]">{t('none')}</p>
        </div>
      ) : (
        <ul className="space-y-3 md:space-y-4">
          {filtered.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-4 p-4 rounded-lg border bg-white ${
                n.unread ? 'border-purplePrimary5/30' : 'border-whiteSecondary2'
              }`}
            >
              <div className="relative flex-shrink-0">
                <div className="h-10 w-10 rounded-full border border-whiteSecondary2 bg-white flex items-center justify-center overflow-hidden">
                  {n.icon ? (
                    <Image src={n.icon} alt="icon" width={24} height={24} className="object-contain" />
                  ) : (
                    <Image src="/layer1.svg" alt="logo" width={20} height={20} className="object-contain" />
                  )}
                </div>
                {n.unread && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-purplePrimary5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm md:text-base text-textdark font-medium truncate">{n.title}</h3>
                  <span className="text-xs text-[#909090] ml-3 whitespace-nowrap">{n.timeAgo}</span>
                </div>
                <p className="mt-1 text-sm text-[#606060] leading-5">{n.message}</p>
                <div className="mt-3 flex items-center gap-3">
                  {n.unread && (
                    <span className="inline-flex items-center rounded-full bg-purplePrimary5/10 text-purplePrimary5 text-xs px-2 py-0.5">
                      {t('unread')}
                    </span>
                  )}
                  <button
                    onClick={() => handleDismiss(n.id)}
                    className="text-xs text-[#909090] hover:text-textdark"
                  >
                    {t('dismiss')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}


