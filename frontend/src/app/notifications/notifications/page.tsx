import { redirect } from 'next/navigation';

// LF-204: the page moved from the doubled path to /notifications.
export default function LegacyNotificationsPage() {
  redirect('/notifications');
}
