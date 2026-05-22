import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from './redis.js';
import { executeTask } from '../agents/executor.js';

const TASK_QUEUE_NAME = 'arp-tasks';

let taskQueue: Queue | null = null;
let taskWorker: Worker | null = null;

export function getTaskQueue(): Queue {
  if (!taskQueue) {
    taskQueue = new Queue(TASK_QUEUE_NAME, {
      connection: getRedisClient(),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return taskQueue;
}

export function startWorker(): Worker {
  if (taskWorker) return taskWorker;

  taskWorker = new Worker(
    TASK_QUEUE_NAME,
    async (job: Job) => {
      const { taskId } = job.data as { taskId: string };
      console.log(`[Worker] Starting task ${taskId}`);
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
    console.error(`[Worker] Task ${job?.data?.taskId} failed:`, err.message);
  });

  console.log('[Worker] Task worker started');
  return taskWorker;
}
