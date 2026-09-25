/** Known notification types. The column is a plain string so new types need no migration. */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  FRIEND_REQUEST = 'friend_request',
  NEW_SHARE = 'new_share',
  SHARE_ENGAGEMENT = 'share_engagement',
}
