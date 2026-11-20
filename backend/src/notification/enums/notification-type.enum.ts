/** Known notification types. The column is a plain string so new types need no migration. */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  FRIEND_REQUEST = 'friend_request',
  NEW_SHARE = 'new_share',
  SHARE_ENGAGEMENT = 'share_engagement',
  ROUND_JOINED = 'round_joined',
  ROUND_STARTED = 'round_started',
  ROUND_COMPLETED = 'round_completed',
  REWARD_CLAIMABLE = 'reward_claimable',
  NFT_MINTED = 'nft_minted',
  ROUND_CANCELLED = 'round_cancelled',
}