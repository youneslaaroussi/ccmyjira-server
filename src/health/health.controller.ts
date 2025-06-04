import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class HealthController {
  
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Exclude from Swagger docs since it's just for load balancers
  @ApiTags('health')
  @ApiOperation({
    summary: 'AWS Load Balancer Health Check',
    description: 'Simple health check endpoint for AWS Load Balancer. Returns 200 OK if the service is running.',
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
      },
    },
  })
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
} 