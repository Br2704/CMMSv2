import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { isRedisConnected } from '../services/redis';
import { logger } from '../config/logger';

// Pass maxRetriesPerRequest: null as required by BullMQ, but limit connection retries 
// so it doesn't hang indefinitely if Redis isn't running.
const redisOptions = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};
const connection = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL, redisOptions) 
  : new Redis(redisOptions);

export const backupDeleteQueue = new Queue('backup-delete', { connection });

export async function getDeleteJob(jobId: string) {
  return backupDeleteQueue.getJob(jobId);
}

export async function enqueueDeleteJob(payload: { scope: 'ALL' | 'ORGANIZATION' | 'PLANT'; organizationId?: string; plantId?: string; requestedBy: string }) {
  if (!isRedisConnected()) {
    logger.error('Redis is not connected. Cannot enqueue backup delete job.');
    throw new Error('Redis is required to run background backup deletions.');
  }
  const job = await backupDeleteQueue.add('delete', payload, { removeOnComplete: true, removeOnFail: false });
  return job.id;
}
