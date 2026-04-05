import { randomUUID } from 'crypto';
import type { Response } from 'express';

type TrackingEvent = 'connected' | 'tracking.changed';

type StreamClient = {
  id: string;
  res: Response;
};

function formatEvent(event: TrackingEvent, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

class VisitorTrackingBroker {
  private readonly clientsBySession = new Map<string, Map<string, StreamClient>>();

  subscribe(sessionId: string, res: Response) {
    const client: StreamClient = {
      id: randomUUID(),
      res,
    };

    const bucket = this.clientsBySession.get(sessionId) ?? new Map<string, StreamClient>();
    bucket.set(client.id, client);
    this.clientsBySession.set(sessionId, bucket);

    res.write(
      formatEvent('connected', {
        sessionId,
        connectedAt: new Date().toISOString(),
      }),
    );

    return () => {
      const existingBucket = this.clientsBySession.get(sessionId);
      if (!existingBucket) return;
      existingBucket.delete(client.id);
      if (existingBucket.size === 0) {
        this.clientsBySession.delete(sessionId);
      }
    };
  }

  publish(sessionId: string, payload: Record<string, unknown>) {
    const bucket = this.clientsBySession.get(sessionId);
    if (!bucket || bucket.size === 0) return;

    const streamPayload = formatEvent('tracking.changed', {
      sessionId,
      changedAt: new Date().toISOString(),
      ...payload,
    });

    for (const [clientId, client] of bucket.entries()) {
      try {
        client.res.write(streamPayload);
      } catch {
        bucket.delete(clientId);
      }
    }

    if (bucket.size === 0) {
      this.clientsBySession.delete(sessionId);
    }
  }
}

const visitorTrackingBroker = new VisitorTrackingBroker();

export function subscribeVisitorTrackingStream(sessionId: string, res: Response) {
  return visitorTrackingBroker.subscribe(sessionId, res);
}

export function publishVisitorTrackingChange(sessionId: string | null | undefined, payload: Record<string, unknown>) {
  if (!sessionId) return;
  visitorTrackingBroker.publish(sessionId, payload);
}
