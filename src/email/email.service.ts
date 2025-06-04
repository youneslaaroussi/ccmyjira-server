import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PostmarkWebhookDto } from './dto/postmark-webhook.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue('email-processing') private emailQueue: Queue) {}

  /**
   * Queue email processing job
   */
  async queueEmailProcessing(payload: PostmarkWebhookDto, isDemo: boolean = false): Promise<string> {
    try {
      const job = await this.emailQueue.add(
        'process-email',
        {
          emailData: payload,
          receivedAt: new Date().toISOString(),
          isDemo: isDemo,
        },
        {
          attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3'),
          backoff: {
            type: 'exponential',
            delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '5000'),
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
        },
      );

      return job.id as string;
    } catch (error) {
      this.logger.error('Error queuing email processing job:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const waiting = await this.emailQueue.getWaiting();
    const active = await this.emailQueue.getActive();
    const completed = await this.emailQueue.getCompleted();
    const failed = await this.emailQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }
}
