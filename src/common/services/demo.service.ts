import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JiraConfiguration } from '../../jira/jira.service';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get demo JIRA configuration
   */
  getDemoJiraConfig(): JiraConfiguration {
    return {
      baseUrl: this.configService.get<string>('DEMO_JIRA_BASE_URL') || '',
      projectKey: this.configService.get<string>('DEMO_JIRA_PROJECT_KEY') || '',
      cloudId: this.configService.get<string>('DEMO_JIRA_CLOUD_ID'),
      accessToken: this.configService.get<string>('DEMO_JIRA_ACCESS_TOKEN') || '',
      userAccountId: this.configService.get<string>('DEMO_JIRA_USER_ACCOUNT_ID') || '',
    };
  }

  /**
   * Get demo user information
   */
  getDemoUser() {
    return {
      id: this.configService.get<string>('DEMO_USER_ID') || 'demo-user-123',
      email: this.configService.get<string>('DEMO_USER_EMAIL') || 'demo@ccmyjira.com',
      displayName: this.configService.get<string>('DEMO_USER_NAME') || 'Demo User',
      organizationId: this.configService.get<string>('DEMO_ORGANIZATION_ID') || 'demo-org-123',
    };
  }

  /**
   * Check if demo mode is properly configured
   */
  isDemoConfigured(): boolean {
    const requiredEnvVars = [
      'DEMO_JIRA_BASE_URL',
      'DEMO_JIRA_PROJECT_KEY', 
      'DEMO_JIRA_ACCESS_TOKEN',
      'DEMO_JIRA_USER_ACCOUNT_ID',
      'DEMO_USER_ID',
      'DEMO_USER_EMAIL',
      'DEMO_USER_NAME',
      'DEMO_ORGANIZATION_ID',
    ];

    const missingVars = requiredEnvVars.filter(
      varName => !this.configService.get<string>(varName)
    );

    if (missingVars.length > 0) {
      this.logger.warn(`🎭 Demo mode configuration incomplete. Missing: ${missingVars.join(', ')}`);
      return false;
    }

    return true;
  }

  /**
   * Get demo configuration status
   */
  getDemoStatus() {
    const isConfigured = this.isDemoConfigured();
    const demoUser = this.getDemoUser();
    const demoJiraConfig = this.getDemoJiraConfig();

    return {
      configured: isConfigured,
      user: {
        id: demoUser.id,
        email: demoUser.email,
        displayName: demoUser.displayName,
        organizationId: demoUser.organizationId,
      },
      jira: {
        baseUrl: demoJiraConfig.baseUrl,
        projectKey: demoJiraConfig.projectKey,
        cloudId: demoJiraConfig.cloudId,
        hasAccessToken: !!demoJiraConfig.accessToken,
        userAccountId: demoJiraConfig.userAccountId,
      },
    };
  }
} 