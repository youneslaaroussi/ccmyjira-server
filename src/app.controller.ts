import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DemoService } from './common/services/demo.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly demoService: DemoService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('demo/status')
  @ApiTags('demo')
  @ApiOperation({
    summary: 'Get demo mode status',
    description: 'Returns the configuration status of demo mode including demo user and JIRA setup.',
  })
  @ApiResponse({
    status: 200,
    description: 'Demo mode status',
    schema: {
      type: 'object',
      properties: {
        demoMode: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                displayName: { type: 'string' },
                organizationId: { type: 'string' },
              },
            },
            jira: {
              type: 'object',
              properties: {
                baseUrl: { type: 'string' },
                projectKey: { type: 'string' },
                cloudId: { type: 'string' },
                hasAccessToken: { type: 'boolean' },
                userAccountId: { type: 'string' },
              },
            },
          },
        },
        message: { type: 'string' },
        examples: {
          type: 'object',
          properties: {
            authMe: { type: 'string' },
            dashboard: { type: 'string' },
            jiraDashboard: { type: 'string' },
          },
        },
      },
    },
  })
  getDemoStatus() {
    const demoStatus = this.demoService.getDemoStatus();
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';

    return {
      demoMode: demoStatus,
      message: demoStatus.configured
        ? 'Demo mode is configured and ready to use'
        : 'Demo mode is not properly configured. Check environment variables.',
      examples: {
        authMe: `${baseUrl}/demo/auth/me`,
        dashboard: `${baseUrl}/demo/api/dashboard`,
        jiraDashboard: `${baseUrl}/demo/api/dashboard/jira`,
      },
    };
  }
}
