import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : new Redis();

export const backupDeleteQueue = new Queue('backup-delete', { connection });

export async function getDeleteJob(jobId: string) {
  return backupDeleteQueue.getJob(jobId);
}

export async function enqueueDeleteJob(payload: { scope: 'ALL' | 'ORGANIZATION' | 'PLANT'; organizationId?: string; plantId?: string; requestedBy: string }) {
  const job = await backupDeleteQueue.add('delete', payload, { removeOnComplete: true, removeOnFail: false });
  return job.id;
}
