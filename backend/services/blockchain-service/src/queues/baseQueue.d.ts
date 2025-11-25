import { Queue, Job, JobOptions } from 'bull';
import { EventEmitter } from 'events';
interface QueueMetrics {
    processed: number;
    failed: number;
    completed: number;
    active: number;
}
interface JobInfo {
    id: string | number | undefined;
    data: any;
    opts: JobOptions;
}
interface JobStatus {
    id: string | number | undefined;
    state: string;
    progress: number | object;
    data: any;
    failedReason: string | undefined;
    attemptsMade: number;
    timestamp: number;
    processedOn: number | null;
    finishedOn: number | null;
}
interface QueueStats {
    name: string;
    counts: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: number;
        total: number;
    };
    metrics: QueueMetrics;
}
export declare class BaseQueue extends EventEmitter {
    protected queueName: string;
    protected queue: Queue;
    protected metrics: QueueMetrics;
    constructor(queueName: string, options?: any);
    setupEventHandlers(): void;
    addJob(data: any, options?: JobOptions): Promise<JobInfo>;
    getJob(jobId: string | number): Promise<Job | null>;
    getJobStatus(jobId: string | number): Promise<JobStatus | null>;
    retryJob(jobId: string | number): Promise<{
        success: boolean;
        jobId: string | number;
    }>;
    removeJob(jobId: string | number): Promise<{
        success: boolean;
        jobId: string | number;
    }>;
    getQueueStats(): Promise<QueueStats>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    clean(grace?: number): Promise<Job[]>;
    close(): Promise<void>;
}
export default BaseQueue;
//# sourceMappingURL=baseQueue.d.ts.map