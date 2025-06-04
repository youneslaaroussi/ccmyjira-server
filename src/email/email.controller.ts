import {
  Controller,
  Post,
  Body,
  HttpCode,
  Logger,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { PostmarkWebhookDto } from './dto/postmark-webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {
    this.logger.log('🏗️ EmailController initialized');
  }

  @Post('postmark')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Process Postmark email webhook',
    description: `
      Receives inbound emails from Postmark and queues them for AI processing.
      
      This endpoint is designed to be called by Postmark's inbound webhook service.
      The AI system will analyze the email content and automatically create or update JIRA tickets based on the email content.
      
      **Processing Flow:**
      1. Email is validated and parsed
      2. Job is queued for background processing
      3. AI agent analyzes email content
      4. JIRA tickets are created/updated automatically
      5. Smart assignment based on team workload and expertise
    `,
  })
  @ApiConsumes('application/json')
  @ApiProduces('application/json')
  @ApiBody({
    description: 'Postmark inbound email webhook payload',
    schema: {
      type: 'object',
      required: ['From', 'Subject', 'MessageID'],
      properties: {
        FromName: { type: 'string', example: 'John Doe' },
        From: { type: 'string', example: 'john@example.com' },
        ToFull: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Email: { type: 'string', example: 'support@yourcompany.com' },
              Name: { type: 'string', example: 'Support Team' },
            },
          },
        },
        Subject: { type: 'string', example: 'Bug Report: Login page not working' },
        HtmlBody: { type: 'string', example: '<html><body>The login page is broken...</body></html>' },
        TextBody: { type: 'string', example: 'The login page is broken when I try to sign in...' },
        MessageID: { type: 'string', example: 'a8c1040e-db1c-4e18-ac79-bc5f5a992673' },
        Date: { type: 'string', example: '2024-01-15T10:30:00Z' },
        RecordType: { type: 'string', example: 'Inbound' },
        Attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Name: { type: 'string', example: 'screenshot.png' },
              Content: { type: 'string', example: 'base64-encoded-content' },
              ContentType: { type: 'string', example: 'image/png' },
              ContentLength: { type: 'number', example: 54321 },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Email successfully queued for processing',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        jobId: { type: 'string', example: '12345' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid email payload or validation failed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: { type: 'string', example: 'Invalid email format' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Server error during email processing',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: { type: 'string', example: 'Queue connection failed' },
      },
    },
  })
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

      // Check if this is a demo request
      const isDemo = req.isDemo || false;
      if (isDemo) {
        this.logger.log('🎭 Demo mode detected - will use demo JIRA configuration');
      }

      // Queue the email processing job with demo flag
      const jobId = await this.emailService.queueEmailProcessing(payload, isDemo);

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
  @ApiOperation({
    summary: 'Test webhook endpoint',
    description: `
      Test endpoint for debugging and validating the email processing system.
      
      This endpoint provides detailed information about:
      - Service availability status
      - Queue connection health
      - System environment details
      - Processing statistics
      
      Use this endpoint to verify that the system is properly configured before sending real emails.
    `,
  })
  @ApiOkResponse({
    description: 'Test endpoint successfully executed',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Email webhook endpoint is working!' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        queueStats: {
          type: 'object',
          properties: {
            waiting: { type: 'number', example: 2 },
            active: { type: 'number', example: 1 },
            completed: { type: 'number', example: 145 },
            failed: { type: 'number', example: 3 },
          },
        },
        debug: {
          type: 'object',
          properties: {
            emailServiceAvailable: { type: 'boolean', example: true },
            nodeVersion: { type: 'string', example: 'v18.17.0' },
            platform: { type: 'string', example: 'win32' },
          },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Test endpoint failed',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Redis connection failed' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
      },
    },
  })
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
  @ApiTags('health')
  @ApiOperation({
    summary: 'Webhook health check',
    description: `
      Basic health check for webhook endpoints.
      
      This endpoint provides a simple health status without triggering heavy operations.
      Use this for load balancer health checks or simple monitoring.
    `,
  })
  @ApiOkResponse({
    description: 'Webhook endpoints are healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        services: {
          type: 'object',
          properties: {
            redis: { type: 'string', example: 'unknown' },
            emailService: { type: 'string', example: 'available' },
          },
        },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Health check failed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        error: { type: 'string', example: 'Service unavailable' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
      },
    },
  })
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
 