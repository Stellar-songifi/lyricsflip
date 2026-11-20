/**
 * Event names emitted by the indexer onto the EventEmitter2 bus.
 * Subscribe with @OnEvent(IndexerEventNames.XYZ).
 */
export const IndexerEventNames = {
  ROUND_CREATED: 'indexer.round.created',
  ROUND_JOINED: 'indexer.round.joined',
  ROUND_STARTED: 'indexer.round.started',
  ROUND_COMPLETED: 'indexer.round.completed',
  ROUND_CANCELLED: 'indexer.round.cancelled',
  ANSWER_SUBMITTED: 'indexer.answer.submitted',
  NFT_MINTED: 'indexer.nft.minted',
  REWARD_CLAIMED: 'indexer.reward.claimed',
} as const;

export type IndexerEventName =
  (typeof IndexerEventNames)[keyof typeof IndexerEventNames];
