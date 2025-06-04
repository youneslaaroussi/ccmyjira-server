import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { PostmarkWebhookDto } from '../../email/dto/postmark-webhook.dto';
import { DomainLookupService, DomainLookupResult } from '../../domain/domain-lookup.service';

export interface EmailProcessingJobData {
  emailData: PostmarkWebhookDto;
  receivedAt: string;
}

@Processor('email-processing')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly domainLookupService: DomainLookupService,
  ) {
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

      // Look up organization and user context from email domain
      let domainLookup: DomainLookupResult | null = null;
      if (emailData.From) {
        domainLookup = await this.domainLookupService.findOrganizationByEmailDomain(
          emailData.From,
        );

        if (domainLookup) {
          this.logger.log(
            `🏢 Found organization: ${domainLookup.organization.name} (${domainLookup.organizationId})`,
          );
          this.logger.log(
            `👤 Using user: ${domainLookup.user.displayName} (${domainLookup.userId})`,
          );
        } else {
          this.logger.warn(
            `⚠️ No verified domain configuration found for email: ${emailData.From}`,
          );
          this.logger.warn(
            `💡 JIRA operations will be disabled. To enable JIRA integration, the domain needs to be verified.`,
          );
        }
      }

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
        // Include organization/user context if found
        userId: domainLookup?.userId,
        organizationId: domainLookup?.organizationId,
      });

      this.logger.log(`Email processing completed for job ${job.id}:`, result);

      // Log successful processing to database if we have organization context
      if (domainLookup) {
        try {
          // This could be enhanced to log to email_processing_logs table
          this.logger.log(
            `📊 Processing successful for organization ${domainLookup.organization.name}: ${result.summary}`,
          );
        } catch (logError) {
          this.logger.warn('Failed to log processing result:', logError);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing email job ${job.id}:`, error);
      throw error; // This will mark the job as failed and trigger retries
    }
  }
}
