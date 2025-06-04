import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import * as postmark from 'postmark';
import { DomainVerificationEmail } from './domain-verification';
import { LinkTrackingOptions } from 'postmark/dist/client/models';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: postmark.ServerClient;

  constructor(private configService: ConfigService) {
    const apiToken = this.configService.get<string>('POSTMARK_API_TOKEN');
    
    if (!apiToken) {
      this.logger.warn('⚠️  POSTMARK_API_TOKEN not configured - email sending will fail');
    } else {
      this.client = new postmark.ServerClient(apiToken);
      this.logger.log('✅ Postmark email service initialized');
    }
  }

  /**
   * Check if email service is properly configured
   */
  isConfigured(): boolean {
    return !!this.client;
  }

  /**
   * Send domain verification email using React Email template
   */
  async sendDomainVerificationEmail(
    domain: string,
    verificationCode: string,
    verificationUrl: string,
    email: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Email service not configured - missing POSTMARK_API_TOKEN');
    }

    try {
      // Render the React email template to HTML
      const emailHtml = await render(
        DomainVerificationEmail({
          domain,
          verificationCode,
          verificationUrl,
          email,
        }),
      );

      // Send email via Postmark
      const result = await this.client.sendEmail({
        From: this.configService.get<string>('FROM_EMAIL') || 'noreply@ccmyjira.com',
        To: email,
        Subject: `Verify domain ownership for ${domain} - CCMyJIRA`,
        HtmlBody: emailHtml,
        TextBody: this.generateTextVersion(domain, verificationCode, verificationUrl, email),
        Tag: 'domain-verification',
        TrackOpens: true,
        TrackLinks: LinkTrackingOptions.HtmlAndText
      });

      this.logger.log(`📧 Domain verification email sent to ${email} (MessageID: ${result.MessageID})`);
    } catch (error) {
      this.logger.error('❌ Failed to send domain verification email:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  /**
   * Generate plain text version of the email
   */
  private generateTextVersion(
    domain: string,
    verificationCode: string,
    verificationUrl: string,
    email: string,
  ): string {
    return `
🔐 Domain Verification Required - CCMyJIRA

Hello,

You need to verify ownership of the domain "${domain}" to complete your CCMyJIRA setup.

VERIFICATION CODE: ${verificationCode}

You can verify your domain by:

1. Clicking this link: ${verificationUrl}
2. Or entering the verification code manually in your CCMyJIRA dashboard.

⏰ IMPORTANT: This verification link expires in 24 hours for security reasons.

If you didn't request this verification, please ignore this email. Your domain will remain unverified.

---
CCMyJIRA - Smart JIRA Ticket Assignment
Powered by AI • Secured by Atlassian OAuth

This email was sent to ${email} because a domain verification was requested for your organization.
If you have questions, please contact our support team.
    `.trim();
  }

  /**
   * Test email service connectivity
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Simple connectivity test - just check if client is initialized
      this.logger.log('📧 Email service configured and ready');
      return true;
    } catch (error) {
      this.logger.error('❌ Email service test failed:', error.message);
      return false;
    }
  }

  /**
   * Get email service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      provider: 'Postmark',
      fromEmail: this.configService.get<string>('FROM_EMAIL') || 'noreply@ccmyjira.com',
    };
  }
} 