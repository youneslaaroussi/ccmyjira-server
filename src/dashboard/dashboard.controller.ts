import {
  Controller,
  Get,
  Query,
  Post,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JiraConfigService } from '../jira/jira-config.service';

@ApiTags('dashboard')
@Controller('api/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly jiraConfigService: JiraConfigService,
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get complete dashboard data',
    description: 'Returns comprehensive dashboard data including system statistics, JIRA project information, and real-time metrics. This endpoint provides all the data needed for a complete dashboard view.',
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get JIRA project dashboard',
    description: 'Returns comprehensive JIRA project information including statistics, team info, and recent activity.',
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
   * Get JIRA tickets with optional filtering
   * GET /api/dashboard/tickets?days=7&status=Open&assignee=john@example.com&search=bug&organizationId=abc123
   */
  @Get('tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get JIRA tickets with filtering',
    description: 'Retrieve JIRA tickets with optional filtering by date range, status, assignee, and search text.',
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
   * Get project users with their roles and information
   * GET /api/dashboard/users?role=developer&activeOnly=true&organizationId=abc123
   */
  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get project users',
    description: 'Retrieve all users who have access to the JIRA project with their roles and information.',
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
   * GET /api/dashboard/workloads?userIds=user1,user2,user3&organizationId=abc123
   */
  @Get('workloads')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user workloads',
    description: 'Retrieve current workload information for specific users or all project users.',
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
   * Get sprint information (if sprints are enabled)
   * GET /api/dashboard/sprints?organizationId=abc123
   */
  @Get('sprints')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get sprint information',
    description: 'Retrieve sprint information including active, upcoming, and completed sprints (requires sprint feature to be enabled).',
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
   * Get assignee suggestions for a ticket
   * GET /api/dashboard/suggest-assignee?type=Bug&technologies=javascript,react&priority=High&organizationId=abc123
   */
  @Get('suggest-assignee')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get assignee suggestions',
    description: 'Get AI-powered suggestions for ticket assignment based on ticket type, technologies, priority, and team workload.',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    type: 'string',
    description: 'Organization ID (uses user default if not provided)',
  })
  @ApiQuery({
    name: 'type',
    required: true,
    type: 'string',
    description: 'Ticket type',
    example: 'Bug',
    enum: ['Bug', 'Story', 'Task', 'Epic', 'Subtask'],
  })
  @ApiQuery({
    name: 'technologies',
    required: false,
    type: 'string',
    description: 'Comma-separated list of technologies',
    example: 'javascript,react,node.js',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    type: 'string',
    description: 'Ticket priority',
    example: 'High',
    enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
  })
  @ApiQuery({
    name: 'component',
    required: false,
    type: 'string',
    description: 'Component affected',
    example: 'authentication',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved assignee suggestions',
    schema: {
      type: 'object',
      properties: {
        availableUsers: {
          type: 'array',
          items: {
                type: 'object',
                properties: {
                  accountId: { type: 'string', example: 'user123' },
                  displayName: { type: 'string', example: 'John Doe' },
                  emailAddress: { type: 'string', example: 'john.doe@company.com' },
              username: { type: 'string', example: 'john.doe' },
              active: { type: 'boolean', example: true },
              roles: { type: 'array', items: { type: 'string' }, example: ['Developers'] },
              workload: {
                type: 'object',
                properties: {
                  totalTickets: { type: 'number', example: 12 },
                  inProgressTickets: { type: 'number', example: 3 },
                  todoTickets: { type: 'number', example: 0 },
                  storyPoints: { type: 'number', example: 21 },
                  overdue: { type: 'number', example: 1 },
                },
              },
              },
            },
          },
        context: {
          type: 'object',
          properties: {
            ticketType: { type: 'string', example: 'Bug' },
            technologies: { type: 'array', items: { type: 'string' }, example: ['javascript', 'react'] },
            priority: { type: 'string', example: 'High' },
            component: { type: 'string', example: 'authentication' },
          },
        },
        message: { type: 'string', example: 'Retrieved 3 available users for assignment consideration' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Ticket type is required',
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to suggest assignee',
  })
  async suggestAssignee(
    @Req() req: any,
    @Query('organizationId') organizationId?: string,
    @Query('type') ticketType?: string,
    @Query('technologies') technologies?: string,
    @Query('priority') priority?: string,
    @Query('component') component?: string,
  ) {
    try {
      if (!ticketType) {
        throw new HttpException('Ticket type is required', HttpStatus.BAD_REQUEST);
      }

      const { userId, organizationId: orgId } = await this.getUserContext(req, organizationId);
      const techArray = technologies ? technologies.split(',') : [];
      
      // Get JIRA config to check if properly configured
      try {
        const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, orgId);
        const assignmentData = await this.dashboardService.jiraService.suggestAssignee(
          jiraConfig,
          ticketType,
          techArray,
          priority || 'Medium',
          component,
        );
        
        return {
          availableUsers: assignmentData.users.map(user => ({
            accountId: user.accountId,
            displayName: user.displayName,
            emailAddress: user.emailAddress,
            username: user.username,
            active: user.active,
            roles: user.roles || [],
            workload: assignmentData.workloads[user.accountId] || {
              totalTickets: 0,
              inProgressTickets: 0,
              todoTickets: 0,
              storyPoints: 0,
              overdue: 0
            }
          })),
          context: assignmentData.context,
          message: `Retrieved ${assignmentData.users.length} available users for assignment consideration`,
        };
      } catch (configError) {
        return {
          availableUsers: [],
          context: { ticketType, technologies: techArray, priority: priority || 'Medium', component },
          message: 'JIRA not configured - smart assignment unavailable',
          fallbackRecommendation: 'Complete organization JIRA setup to enable smart ticket assignment',
          error: configError.message
        };
      }
    } catch (error) {
      throw new HttpException(
        `Failed to suggest assignee: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get system health status
   * GET /api/dashboard/health?organizationId=abc123
   */
  @Get('health')
  @ApiTags('health')
  @ApiOperation({
    summary: 'Get system health',
    description: 'Check the health status of all system components including queue, JIRA connection, and external dependencies.',
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
  @UseGuards(JwtAuthGuard)
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
   * Clear all caches to force fresh data
   * POST /api/dashboard/refresh
   */
  @Post('refresh')
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
   * Debug endpoint to test user fetching
   * GET /api/dashboard/debug-users?organizationId=abc123
   */
  @Get('debug-users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
}
 