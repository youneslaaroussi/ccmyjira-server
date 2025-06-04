import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@Controller()
export class HealthController {
  
  constructor(private readonly configService: ConfigService) {}
  
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Exclude from Swagger docs since it's just for load balancers
  @ApiTags('health')
  @ApiOperation({
    summary: 'AWS Load Balancer Health Check',
    description: 'Simple health check endpoint for AWS Load Balancer. Returns 200 OK if the service is running. Supports demo mode when no authentication is provided.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        uptime: { type: 'number', example: 86400 },
        mode: { type: 'string', example: 'demo' },
        demoConfig: {
          type: 'object',
          properties: {
            jiraBaseUrl: { type: 'string', example: 'https://demo-ccmyjira.atlassian.net' },
            projectKey: { type: 'string', example: 'DEMO' },
            userEmail: { type: 'string', example: 'demo@ccmyjira.com' },
            organizationId: { type: 'string', example: 'demo-org-12345' },
          }
        }
      },
    },
  })
  async healthCheck(@Req() req: any) {
    const isDemo = !req.user || req.isDemo || req.user?.isDemo;
    
    const response: any = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mode: isDemo ? 'demo' : 'authenticated',
    };

    // Include demo configuration info if in demo mode
    if (isDemo) {
      response.demoConfig = {
        jiraBaseUrl: this.configService.get('DEMO_JIRA_BASE_URL') || 'https://demo-ccmyjira.atlassian.net',
        projectKey: this.configService.get('DEMO_JIRA_PROJECT_KEY') || 'DEMO',
        userEmail: this.configService.get('DEMO_USER_EMAIL') || 'demo@ccmyjira.com',
        organizationId: this.configService.get('DEMO_ORGANIZATION_ID') || 'demo-org-12345',
      };
    }

    return response;
  }
} 