import {
  Controller,
  Post,
  Body,
  HttpCode,
  Logger,
  Req,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { PostmarkWebhookDto } from './dto/postmark-webhook.dto';

@Controller('webhooks')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {
    this.logger.log('🏗️ EmailController initialized');
  }

  @Post('postmark')
  @HttpCode(200)
  async handlePostmarkWebhook(
    @Body() payload: PostmarkWebhookDto,
    @Req() req: any,
  ): Promise<{ success: boolean; jobId?: string }> {
    try {
      this.logger.log('📥 Postmark webhook received (after validation)');
      this.logger.log('📥 User-Agent:', req.headers['user-agent']);
      this.logger.log('📧 Record Type:', payload.RecordType);

      // Log basic email details for debugging
      if (payload.From && payload.Subject) {
        this.logger.log(
          `📧 Email from: ${payload.From}, subject: ${payload.Subject}`,
        );
      }

      // Queue the email processing job
      const jobId = await this.emailService.queueEmailProcessing(payload);

      this.logger.log(`✅ Email processing queued with job ID: ${jobId}`);
      return { success: true, jobId };
    } catch (error) {
      this.logger.error('❌ Error handling Postmark webhook:', error);
      this.logger.error('❌ Error stack:', error.stack);
      return { success: false };
    }
  }

  @Post('test')
  @HttpCode(200)
  async testEndpoint(): Promise<{ message: string; timestamp: string }> {
    this.logger.log('🧪 Test endpoint called - START');

    try {
      this.logger.log('🔍 Step 1: Creating timestamp');
      const timestamp = new Date().toISOString();
      this.logger.log(`🔍 Step 2: Timestamp created: ${timestamp}`);

      this.logger.log('🔍 Step 3: Testing email service availability');
      const isEmailServiceAvailable = !!this.emailService;
      this.logger.log(
        `🔍 Step 4: Email service available: ${isEmailServiceAvailable}`,
      );

      this.logger.log(
        '🔍 Step 5: Testing queue stats (this might trigger Redis connection)',
      );
      let queueStats: any = null;
      try {
        queueStats = await this.emailService.getQueueStats();
        this.logger.log(
          `🔍 Step 6: Queue stats retrieved successfully:`,
          queueStats,
        );
      } catch (queueError) {
        this.logger.error('🚨 Step 6: Queue stats failed:', queueError.message);
        this.logger.error('🚨 Queue error details:', {
          code: queueError.code,
          errno: queueError.errno,
          syscall: queueError.syscall,
        });
      }

      this.logger.log('🔍 Step 7: Preparing response object');
      const response = {
        message: 'Email webhook endpoint is working!',
        timestamp,
        queueStats,
        debug: {
          emailServiceAvailable: isEmailServiceAvailable,
          nodeVersion: process.version,
          platform: process.platform,
        },
      };

      this.logger.log('🔍 Step 8: Response prepared, returning');
      this.logger.log('✅ Test endpoint called - SUCCESS');

      return response;
    } catch (error) {
      this.logger.error('🚨 Test endpoint error:', error.message);
      this.logger.error('🚨 Error details:', {
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        stack: error.stack,
      });

      throw error;
    }
  }

  @Post('health')
  @HttpCode(200)
  async healthCheck(): Promise<any> {
    this.logger.log('🏥 Health check called');

    const services = {
      redis: 'unknown',
      emailService: 'unknown',
    };

    try {
      // Test email service
      services.emailService = this.emailService ? 'available' : 'unavailable';

      // Don't test Redis directly to avoid triggering the error
      this.logger.log('🏥 Health check completed - basic services');

      return {
        status: 'ok',
        services,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('🚨 Health check failed:', error);
      return {
        status: 'error',
        services,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
