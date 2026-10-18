import { EventEmitter } from 'events';

/**
 * In-process real-time bus (Q11). Publish only AFTER a transaction commits.
 * Payloads carry ids, not record contents: clients refetch through permission-checked
 * endpoints, so the stream never leaks data a user may not see.
 */
export type RealtimeEventType =
  | 'lead.created'
  | 'lead.assigned'
  | 'lead.acknowledged'
  | 'lead.escalated'
  | 'lead.unassigned'
  | 'lead.activity'
  | 'availability.changed'
  | 'message.received';

export interface RealtimeEvent {
  type: RealtimeEventType;
  workspaceId: string;
  leadId?: string;
  userId?: string | null;
  previousUserId?: string | null;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(event: Omit<RealtimeEvent, 'at'>): void {
  bus.emit(`ws:${event.workspaceId}`, { ...event, at: new Date().toISOString() });
}

export function publishAll(events: Array<Omit<RealtimeEvent, 'at'>>): void {
  events.forEach(publish);
}

export function subscribe(workspaceId: string, listener: (event: RealtimeEvent) => void): () => void {
  const channel = `ws:${workspaceId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
