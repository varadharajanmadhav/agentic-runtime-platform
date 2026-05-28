import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from './redis.js';
import { executeTask } from '../agents/executor.js';
import { QUEUE } from '../config/constants.js';

let taskQueue: Queue | null = null;
let taskWorker: Worker | null = null;

export function getTaskQueue(): Queue {
  if (!taskQueue) {
    taskQueue = new Queue(QUEUE.TASK_QUEUE_NAME, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: QUEUE.MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: QUEUE.BACKOFF_DELAY_MS,
        },
        removeOnComplete: { count: QUEUE.REMOVE_ON_COMPLETE_COUNT },
        removeOnFail: { count: QUEUE.REMOVE_ON_FAIL_COUNT },
      },
    });
  }
  return taskQueue;
}

export function startWorker(): Worker {
  if (taskWorker) return taskWorker;

  taskWorker = new Worker(
    QUEUE.TASK_QUEUE_NAME,
    async (job: Job) => {
      const { taskId } = job.data as { taskId: string };
      console.log(`[Worker] Starting task ${taskId} (attempt ${job.attemptsMade + 1}/${QUEUE.MAX_ATTEMPTS})`);
      await executeTask(taskId);
    },
    {
      connection: getRedisClient(),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
    }
  );

  taskWorker.on('completed', (job) => {
    console.log(`[Worker] Task ${job.data.taskId} completed`);
  });

  taskWorker.on('failed', (job, err) => {
    const attempts = job?.attemptsMade ?? 0;
    const isLastAttempt = attempts >= QUEUE.MAX_ATTEMPTS;
    console.error(
      `[Worker] Task ${job?.data?.taskId} failed (attempt ${attempts}/${QUEUE.MAX_ATTEMPTS}${isLastAttempt ? ' — no more retries' : ' — will retry'}):`,
      err.message,
    );
  });

  console.log('[Worker] Task worker started');
  return taskWorker;
}
