import {
  Controller,
  Get,
  Query,
  Post,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
  Param,
  Res,
} from '@nestjs/common';
import {
  DashboardService,
  DashboardData,
  SystemStats,
} from './dashboard.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiOkResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiProduces,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DemoJwtAuthGuard } from '../auth/demo-jwt-auth.guard';
import { JiraConfigService } from '../jira/jira-config.service';
import { JiraService } from '../jira/jira.service';

@ApiTags('dashboard')
@Controller('api/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly jiraConfigService: JiraConfigService,
    private readonly jiraService: JiraService,
  ) {}

  /**
   * Extract user and organization context from request
   */
  private async getUserContext(req: any, organizationId?: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
    }

    // Use provided organizationId or get user's default organization
    let orgId = organizationId;
    if (!orgId) {
      const defaultOrgId = await this.jiraConfigService.getUserDefaultOrganization(userId);
      if (!defaultOrgId) {
        throw new HttpException('No organization found for user', HttpStatus.BAD_REQUEST);
      }
      orgId = defaultOrgId;
    } else {
      // Validate user has access to the organization
      const hasAccess = await this.jiraConfigService.validateUserOrganizationAccess(userId, orgId);
      if (!hasAccess) {
        throw new HttpException('User does not have access to this organization', HttpStatus.FORBIDDEN);
      }
    }

    return { userId, organizationId: orgId };
  }

  /**
   * Get comprehensive dashboard data including system stats and JIRA information
   * GET /api/dashboard?organizationId=abc123
   */
  @Get()
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get complete dashboard data',
    description: 'Returns comprehensive dashboard data including system statistics, JIRA project information, and real-time metrics. This endpoint provides all the data needed for a complete dashboard view. In demo mode (/demo/api/dashboard), uses demo JIRA credentials.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved dashboard data',
    schema: {
      type: 'object',
      properties: {
        systemStats: {
          type: 'object',
          properties: {
            server: {
              type: 'object',
              properties: {
                uptime: { type: 'number', example: 86400 },
                timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
                nodeVersion: { type: 'string', example: 'v18.17.0' },
                environment: { type: 'string', example: 'production' },
              },
            },
            queue: {
              type: 'object',
              properties: {
                waiting: { type: 'number', example: 2 },
                active: { type: 'number', example: 1 },
                completed: { type: 'number', example: 145 },
                failed: { type: 'number', example: 3 },
              },
            },
            memory: {
              type: 'object',
              properties: {
                used: { type: 'number', example: 256 },
                total: { type: 'number', example: 1024 },
                percentage: { type: 'number', example: 25 },
              },
            },
          },
        },
        jiraData: {
          type: 'object',
          description: 'Complete JIRA project information and statistics',
        },
        lastUpdated: { type: 'string', example: '2024-01-15T10:30:00Z' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch dashboard data',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Failed to fetch dashboard data: Connection error' },
        error: { type: 'string', example: 'Internal Server Error' },
      },
    },
  })
  async getDashboard(@Req() req: any, @Query('organizationId') organizationId?: string): Promise<DashboardData> {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      return await this.dashboardService.getDashboardData(userId, orgId);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch dashboard data: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get system statistics only (no auth required)
   * GET /api/dashboard/stats
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get system statistics',
    description: 'Returns only system statistics including server info, queue status, memory usage, and processing metrics.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved system statistics',
    type: 'object',
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch system stats',
  })
  async getSystemStats(): Promise<SystemStats> {
    try {
      return await this.dashboardService.getSystemStats();
    } catch (error) {
      throw new HttpException(
        `Failed to fetch system stats: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get JIRA project dashboard data only
   * GET /api/dashboard/jira?organizationId=abc123
   */
  @Get('jira')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get JIRA project dashboard',
    description: 'Returns comprehensive JIRA project information including statistics, team info, and recent activity. In demo mode (/demo/api/dashboard/jira), uses demo JIRA project.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved JIRA dashboard data',
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch JIRA dashboard',
  })
  async getJiraDashboard(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      const dashboardData = await this.dashboardService.getDashboardData(userId, orgId);
      return dashboardData.jiraData;
    } catch (error) {
      throw new HttpException(
        `Failed to fetch JIRA dashboard: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get JIRA tickets with filtering options
   * GET /api/dashboard/tickets?organizationId=abc123&days=30&status=In%20Progress
   */
  @Get('tickets')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get JIRA tickets with filtering',
    description: 'Returns JIRA tickets for the project with various filtering options. In demo mode, returns demo project tickets.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: 'number',
    description: 'Number of days to look back (default: 7)',
    example: 14,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: 'string',
    description: 'Filter by ticket status',
    example: 'Open',
  })
  @ApiQuery({
    name: 'assignee',
    required: false,
    type: 'string',
    description: 'Filter by assignee email',
    example: 'john@example.com',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: 'string',
    description: 'Search text in summary/description',
    example: 'login bug',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved JIRA tickets',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'PROJ-123' },
          summary: { type: 'string', example: 'Fix login page bug' },
          status: { type: 'string', example: 'In Progress' },
          priority: { type: 'string', example: 'High' },
          assignee: { type: 'string', example: 'john.doe@company.com' },
          created: { type: 'string', example: '2024-01-10T14:30:00Z' },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch JIRA tickets',
  })
  async getJiraTickets(
    @Req() req: any,
    @Query('organizationId') organizationId?: string,
    @Query('days') days?: string,
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('search') searchText?: string,
  ) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      const daysNum = days ? parseInt(days, 10) : undefined;
      return await this.dashboardService.getJiraTickets(userId, orgId, daysNum, status, assignee, searchText);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch JIRA tickets: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get project users and team members
   * GET /api/dashboard/users?organizationId=abc123&role=Developer
   */
  @Get('users')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get project users',
    description: 'Returns list of users in the JIRA project with optional role filtering. In demo mode, returns demo project team.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    type: 'string',
    description: 'Filter by role',
    example: 'developer',
  })
  @ApiQuery({
    name: 'activeOnly',
    required: false,
    type: 'boolean',
    description: 'Only return active users (default: true)',
    example: true,
  })
  @ApiOkResponse({
    description: 'Successfully retrieved project users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          accountId: { type: 'string', example: 'user123' },
          displayName: { type: 'string', example: 'John Doe' },
          emailAddress: { type: 'string', example: 'john.doe@company.com' },
          active: { type: 'boolean', example: true },
          roles: { type: 'array', items: { type: 'string' }, example: ['Developers'] },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch project users',
  })
  async getProjectUsers(
    @Req() req: any,
    @Query('organizationId') organizationId?: string,
    @Query('role') role?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      const users = await this.dashboardService.getProjectUsers(userId, orgId);
      
      // Apply filters
      let filteredUsers = users;
      
      if (role) {
        filteredUsers = filteredUsers.filter(user => 
          user.roles?.some(r => r.toLowerCase().includes(role.toLowerCase()))
        );
      }
      
      if (activeOnly !== 'false') {
        filteredUsers = filteredUsers.filter(user => user.active);
      }
      
      return filteredUsers;
    } catch (error) {
      throw new HttpException(
        `Failed to fetch project users: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get user workload information
   * GET /api/dashboard/workloads?organizationId=abc123&userIds=user1,user2
   */
  @Get('workloads')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user workloads',
    description: 'Returns workload information for specified users or all project users. In demo mode, returns demo workload data.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiQuery({
    name: 'userIds',
    required: false,
    type: 'string',
    description: 'Comma-separated list of user account IDs',
    example: 'user1,user2,user3',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved user workloads',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          accountId: { type: 'string', example: 'user123' },
          displayName: { type: 'string', example: 'John Doe' },
          totalTickets: { type: 'number', example: 12 },
          inProgressTickets: { type: 'number', example: 3 },
          storyPoints: { type: 'number', example: 21 },
          overdue: { type: 'number', example: 1 },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch user workloads',
  })
  async getUserWorkloads(
    @Req() req: any,
    @Query('organizationId') organizationId?: string,
    @Query('userIds') userIds?: string
  ) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      const userAccountIds = userIds ? userIds.split(',') : undefined;
      return await this.dashboardService.getUserWorkloads(userId, orgId, userAccountIds);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch user workloads: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Download JIRA attachment by ID
   * GET /api/dashboard/attachments/:attachmentId?organizationId=abc123
   */
  @Get('attachments/:attachmentId')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download JIRA attachment',
    description: 'Downloads a specific JIRA attachment by ID. Returns the file with proper content-type headers.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiOkResponse({
    description: 'Successfully downloaded attachment',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to download attachment',
  })
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
    @Res() res: any,
    @Query('organizationId') organizationId?: string,
  ) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      
      // Get JIRA configuration for the user
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, orgId);
      
      // Fetch the attachment content
      const attachment = await this.jiraService.fetchAttachmentContent(jiraConfig, attachmentId);
      
      // Set appropriate headers
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      res.setHeader('Content-Length', attachment.size);
      
      // Send the file
      res.send(attachment.content);
    } catch (error) {
      throw new HttpException(
        `Failed to download attachment: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get sprint information
   * GET /api/dashboard/sprints?organizationId=abc123
   */
  @Get('sprints')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get sprint information',
    description: 'Returns information about active, upcoming, and completed sprints. In demo mode, returns demo sprint data.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved sprint information',
    schema: {
      type: 'object',
      properties: {
        activeSprints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 123 },
              name: { type: 'string', example: 'Sprint 15' },
              state: { type: 'string', example: 'active' },
              startDate: { type: 'string', example: '2024-01-08T00:00:00Z' },
              endDate: { type: 'string', example: '2024-01-22T00:00:00Z' },
            },
          },
        },
        upcomingSprints: { type: 'array' },
        completedSprints: { type: 'array' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Sprint functionality is disabled',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Sprint functionality is disabled' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch sprint info',
  })
  async getSprintInfo(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      return await this.dashboardService.getSprintInfo(userId, orgId);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch sprint info: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get health status for the JIRA connection and system
   * GET /api/dashboard/health?organizationId=abc123
   */
  @Get('health')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system and JIRA health status',
    description: 'Returns health status of the system and JIRA connection. In demo mode, tests demo JIRA connection.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID for JIRA health check (optional)',
  })
  @ApiOkResponse({
    description: 'System is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        checks: {
          type: 'object',
          properties: {
            queue: {
              type: 'object',
              properties: {
                healthy: { type: 'boolean', example: true },
              },
            },
            jira: {
              type: 'object',
              properties: {
                healthy: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'System is unhealthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'unhealthy' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        error: { type: 'string', example: 'Redis connection failed' },
      },
    },
  })
  async getHealthStatus(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      let userId: string | undefined;
      let orgId: string | undefined;

      // Health check doesn't require auth, but if user is authenticated and org is provided, we can do more thorough check
      if (req.user?.id && organizationId) {
        try {
          const context = await this.getUserContext(req, organizationId);
          userId = context.userId;
          orgId = context.organizationId;
        } catch (error) {
          // Ignore auth errors for health check
        }
      }

      return await this.dashboardService.getHealthStatus(userId, orgId);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch health status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get project metadata for configuration purposes
   * GET /api/dashboard/project-info?organizationId=abc123
   */
  @Get('project-info')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  async getProjectInfo(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      return await this.dashboardService.getProjectMetadata(userId, orgId);
    } catch (error) {
      if (error.status === HttpStatus.BAD_REQUEST || error.status === HttpStatus.FORBIDDEN) {
        return {
          project: null,
          message: 'JIRA not configured or accessible',
          recommendation: 'Complete organization setup to configure JIRA integration',
          error: error.message
        };
      }
      throw new HttpException(
        `Failed to fetch project info: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get system configuration and feature flags
   * GET /api/dashboard/config
   */
  @Get('config')
  async getSystemConfig() {
    try {
      return {
        features: {
          sprintsEnabled:
            this.dashboardService.configService.get<string>(
              'ENABLE_SPRINTS',
            ) === 'true',
          smartAssignmentEnabled:
            this.dashboardService.configService.get<string>(
              'ENABLE_SMART_ASSIGNMENT',
            ) === 'true',
        },
        queue: {
          concurrency:
            this.dashboardService.configService.get<string>(
              'QUEUE_CONCURRENCY',
            ),
          maxAttempts:
            this.dashboardService.configService.get<string>(
              'QUEUE_MAX_ATTEMPTS',
            ),
        },
        ai: {
          model:
            this.dashboardService.configService.get<string>('OPENAI_MODEL'),
          maxTokens:
            this.dashboardService.configService.get<string>(
              'OPENAI_MAX_TOKENS',
            ),
          maxRounds:
            this.dashboardService.configService.get<string>('MAX_ROUNDS'),
        },
        environment:
          this.dashboardService.configService.get<string>('NODE_ENV'),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch system config: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test CORS configuration
   * GET /api/dashboard/cors-test
   */
  @Get('cors-test')
  @ApiOperation({
    summary: 'Test CORS configuration',
    description: 'Simple endpoint to test CORS configuration from different origins. Returns request origin information.',
  })
  @ApiOkResponse({
    description: 'CORS test successful',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'CORS test successful' },
        origin: { type: 'string', example: 'https://ccmyjira.com' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        headers: {
          type: 'object',
          properties: {
            'user-agent': { type: 'string', example: 'Mozilla/5.0...' },
            'accept': { type: 'string', example: 'application/json' },
          },
        },
      },
    },
  })
  async testCors(@Req() req: any) {
    return {
      message: 'CORS test successful',
      origin: req.headers.origin || 'No origin header',
      timestamp: new Date().toISOString(),
      headers: {
        'user-agent': req.headers['user-agent'],
        'accept': req.headers.accept,
        'referer': req.headers.referer,
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      method: req.method,
      url: req.url,
    };
  }

  /**
   * Get queue statistics and job details
   * GET /api/dashboard/queue
   */
  @Get('queue')
  async getQueueDetails() {
    try {
      const stats = await this.dashboardService.getSystemStats();

      // Get recent jobs for more detailed queue information
      const waiting = await this.dashboardService.emailQueue.getWaiting(0, 10);
      const active = await this.dashboardService.emailQueue.getActive(0, 10);
      const completed = await this.dashboardService.emailQueue.getCompleted(
        0,
        10,
      );
      const failed = await this.dashboardService.emailQueue.getFailed(0, 10);

      return {
        stats: stats.queue,
        recentJobs: {
          waiting: waiting.map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
          })),
          active: active.map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
          })),
          completed: completed.slice(0, 5).map((job) => ({
            id: job.id,
            name: job.name,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            returnvalue: job.returnvalue,
          })),
          failed: failed.slice(0, 5).map((job) => ({
            id: job.id,
            name: job.name,
            timestamp: job.timestamp,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace?.slice(0, 500), // Truncate for API response
          })),
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch queue details: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get caches and trigger refresh
   * POST /api/dashboard/refresh-caches
   */
  @Post('refresh-caches')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Refresh all caches',
    description: 'Clears and refreshes all system caches. In demo mode, refreshes demo data caches.',
  })
  async refreshCaches() {
    try {
      return await this.dashboardService.refreshCaches();
    } catch (error) {
      throw new HttpException(
        `Failed to refresh caches: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Debug endpoint to get user information
   * GET /api/dashboard/debug/users?organizationId=abc123
   */
  @Get('debug/users')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Debug: Get user information',
    description: 'Debug endpoint to get detailed user information for troubleshooting. In demo mode, returns demo user debug info.',
  })
  async debugUsers(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      
      // Get JIRA config
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, orgId);
      
      // Test user fetching directly
      const users = await this.dashboardService.jiraService.getProjectUsers(jiraConfig, undefined, false); // Get all users including inactive
      
      return {
        success: true,
        userCount: users.length,
        users: users.map(user => ({
          accountId: user.accountId,
          displayName: user.displayName,
          emailAddress: user.emailAddress,
          username: user.username,
          active: user.active,
          roles: user.roles,
        })),
        message: `Found ${users.length} users`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Debug endpoint to list all accessible JIRA projects
   * GET /api/dashboard/debug/projects?organizationId=abc123
   */
  @Get('debug/projects')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Debug: List all accessible JIRA projects',
    description: 'Debug endpoint to list all JIRA projects accessible with the current token. Useful for troubleshooting project key issues.',
  })
  async debugProjects(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      
      // Get JIRA config
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, orgId);
      
      // Create HTTP client to test API calls
      const httpClient = this.dashboardService.jiraService['createHttpClient'](jiraConfig);
      
      // List all projects accessible to this token
      const projectsResponse = await httpClient.get('/project');
      const projects = projectsResponse.data;
      
      // Also try to get the specific project that's failing
      let specificProject: any = null;
      try {
        const specificResponse = await httpClient.get(`/project/${jiraConfig.projectKey}`);
        specificProject = specificResponse.data;
      } catch (error: any) {
        specificProject = { error: error.response?.data || error.message };
      }
      
      return {
        success: true,
        currentConfig: {
          baseUrl: jiraConfig.baseUrl,
          projectKey: jiraConfig.projectKey,
          cloudId: jiraConfig.cloudId,
          hasAccessToken: !!jiraConfig.accessToken,
          userAccountId: jiraConfig.userAccountId,
          tokenPrefix: jiraConfig.accessToken?.substring(0, 20) + '...',
        },
        allProjects: projects.map((project: any) => ({
          key: project.key,
          name: project.name,
          id: project.id,
          projectTypeKey: project.projectTypeKey,
          style: project.style,
        })),
        specificProject,
        totalProjectCount: projects.length,
        message: `Found ${projects.length} accessible projects. Looking for project key: ${jiraConfig.projectKey}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        message: 'Failed to fetch JIRA projects - check token permissions and cloud ID',
      };
    }
  }

  /**
   * Debug endpoint to test JIRA API connectivity
   * GET /api/dashboard/debug/jira-test?organizationId=abc123
   */
  @Get('debug/jira-test')
  @UseGuards(DemoJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Debug: Test JIRA API connectivity',
    description: 'Debug endpoint to test basic JIRA API connectivity and authentication.',
  })
  async debugJiraTest(@Req() req: any, @Query('organizationId') organizationId?: string) {
    try {
      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      
      // Get JIRA config
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, orgId);
      
      // Create HTTP client
      const httpClient = this.dashboardService.jiraService['createHttpClient'](jiraConfig);
      
      const tests: any[] = [];
      
      // Test 1: Basic API connectivity
      try {
        const serverInfoResponse = await httpClient.get('/serverInfo');
        tests.push({
          test: 'Server Info',
          success: true,
          data: serverInfoResponse.data,
        });
      } catch (error: any) {
        tests.push({
          test: 'Server Info',
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status,
        });
      }
      
      // Test 2: Current user info
      try {
        const myselfResponse = await httpClient.get('/myself');
        tests.push({
          test: 'Current User',
          success: true,
          data: {
            accountId: myselfResponse.data.accountId,
            displayName: myselfResponse.data.displayName,
            emailAddress: myselfResponse.data.emailAddress,
            active: myselfResponse.data.active,
          },
        });
      } catch (error: any) {
        tests.push({
          test: 'Current User',
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status,
        });
      }
      
      // Test 3: List projects
      try {
        const projectsResponse = await httpClient.get('/project');
        tests.push({
          test: 'List Projects',
          success: true,
          data: {
            projectCount: projectsResponse.data.length,
            projectKeys: projectsResponse.data.map((p: any) => p.key),
          },
        });
      } catch (error: any) {
        tests.push({
          test: 'List Projects',
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status,
        });
      }
      
      // Test 4: Specific project access
      try {
        const projectResponse = await httpClient.get(`/project/${jiraConfig.projectKey}`);
        tests.push({
          test: `Access Project ${jiraConfig.projectKey}`,
          success: true,
          data: {
            key: projectResponse.data.key,
            name: projectResponse.data.name,
            id: projectResponse.data.id,
          },
        });
      } catch (error: any) {
        tests.push({
          test: `Access Project ${jiraConfig.projectKey}`,
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status,
        });
      }
      
      const successCount = tests.filter(t => t.success).length;
      
      return {
        success: successCount > 0,
        config: {
          baseUrl: jiraConfig.baseUrl,
          projectKey: jiraConfig.projectKey,
          cloudId: jiraConfig.cloudId,
          apiUrl: `https://api.atlassian.com/ex/jira/${jiraConfig.cloudId}/rest/api/3`,
          tokenPrefix: jiraConfig.accessToken?.substring(0, 20) + '...',
        },
        tests,
        summary: `${successCount}/${tests.length} tests passed`,
        message: successCount === tests.length 
          ? 'All JIRA API tests passed successfully'
          : 'Some JIRA API tests failed - check token permissions and configuration',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        message: 'Failed to run JIRA connectivity tests',
      };
    }
  }
}
 