import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { PostmarkWebhookDto } from '../../email/dto/postmark-webhook.dto';

export interface EmailProcessingJobData {
  emailData: PostmarkWebhookDto;
  receivedAt: string;
}

@Processor('email-processing')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly aiAgentService: AiAgentService) {
    super();
  }

  async process(job: Job<EmailProcessingJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}`);

    try {
      const { emailData, receivedAt } = job.data;

      // Log email details
      this.logger.log(
        `Processing email from: ${emailData.From}, subject: ${emailData.Subject}`,
      );

      // Use AI agent to process the email and determine actions
      const result = await this.aiAgentService.processEmail({
        from: emailData.From || '',
        subject: emailData.Subject || '',
        textBody: emailData.TextBody || '',
        htmlBody: emailData.HtmlBody || '',
        receivedAt,
        messageId: emailData.MessageID || '',
        headers: emailData.Headers || [],
        attachments: emailData.Attachments || [],
      });

      this.logger.log(`Email processing completed for job ${job.id}:`, result);
    } catch (error) {
      this.logger.error(`Error processing email job ${job.id}:`, error);
      throw error; // This will mark the job as failed and trigger retries
    }
  }
}
