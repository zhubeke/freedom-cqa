export function messageIdToEvidenceTurn(messageId: string): number {
  const match = /(?:^|:)m(\d+)$/.exec(messageId);
  if (!match) throw new Error(`Invalid stable message ID: ${messageId}`);
  return Number(match[1]) + 1;
}

export function evidenceMessageIdsToTurns(messageIds: string[]): number[] {
  return messageIds.map(messageIdToEvidenceTurn);
}
