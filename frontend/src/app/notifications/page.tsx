'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

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

interface ApiNotification {
  id: string
  title?: string
  message?: string
  body?: string
  createdAt?: string
  read?: boolean
  isRead?: boolean
  category?: string
  type?: string
  icon?: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function formatTimeAgo(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d`
}

function normalizeCategory(raw?: string): NotificationCategory {
  const value = (raw ?? '').toLowerCase()
  if (value === 'mentions' || value === 'mention') return 'mentions'
  if (value === 'system') return 'system'
  return 'all'
}

function mapNotification(n: ApiNotification): NotificationItem {
  return {
    id: n.id,
    title: n.title ?? 'Notification',
    message: n.message ?? n.body ?? '',
    timeAgo: formatTimeAgo(n.createdAt),
    unread: !(n.read ?? n.isRead ?? false),
    category: normalizeCategory(n.category ?? n.type),
    icon: n.icon,
  }
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`${API_BASE}/notifications`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Failed to load notifications (${res.status})`)
      const data = await res.json()
      const list: ApiNotification[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data?.data)
            ? data.data
            : []
      setItems(list.map(mapNotification))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  const filtered = useMemo(() => {
    if (activeTab === 'all') return items
    return items.filter(n => n.category === activeTab)
  }, [activeTab, items])

  const unreadCount = useMemo(() => items.filter(n => n.unread).length, [items])

  const handleMarkAllAsRead = async () => {
    const previous = items
    setItems(prev => prev.map(n => ({ ...n, unread: false })))
    try {
      const res = await fetch(`${API_BASE}/notifications/mark-read`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Failed to mark all as read (${res.status})`)
    } catch {
      setItems(previous)
    }
  }

  const handleMarkAsRead = async (id: string) => {
    const previous = items
    setItems(prev => prev.map(n => (n.id === id ? { ...n, unread: false } : n)))
    try {
      const res = await fetch(`${API_BASE}/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Failed to mark notification as read (${res.status})`)
    } catch {
      setItems(previous)
    }
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
          <h1 className="text-textdark font-interv text-xl md:text-2xl font-semibold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-purplePrimary5/10 text-purplePrimary5 text-xs px-2 py-0.5">
              {unreadCount} new
            </span>
          )}
        </div>

        <button
          onClick={handleMarkAllAsRead}
          className="text-sm text-purplePrimary5 hover:underline"
        >
          Mark all as read
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-white">
          <p className="text-sm text-[#909090]">Loading notifications…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-white">
          <p className="text-sm text-[#909090]">{error}</p>
          <button
            onClick={() => {
              setLoading(true)
              void fetchNotifications()
            }}
            className="mt-4 text-sm text-purplePrimary5 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-white">
          <Image src="/Noise.png" alt="empty" width={64} height={64} className="opacity-60" />
          <p className="mt-4 text-sm text-[#909090]">No notifications here yet.</p>
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
                      Unread
                    </span>
                  )}
                  {n.unread && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="text-xs text-[#909090] hover:text-textdark"
                    >
                      Mark as read
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(n.id)}
                    className="text-xs text-[#909090] hover:text-textdark"
                  >
                    Dismiss
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


