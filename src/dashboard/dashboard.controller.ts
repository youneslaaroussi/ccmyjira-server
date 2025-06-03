import {
  Controller,
  Get,
  Query,
  Post,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  DashboardService,
  DashboardData,
  SystemStats,
} from './dashboard.service';

@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get comprehensive dashboard data including system stats and JIRA information
   * GET /api/dashboard
   */
  @Get()
  async getDashboard(): Promise<DashboardData> {
    try {
      return await this.dashboardService.getDashboardData();
    } catch (error) {
      throw new HttpException(
        `Failed to fetch dashboard data: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get system statistics only
   * GET /api/dashboard/stats
   */
  @Get('stats')
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
   * GET /api/dashboard/jira
   */
  @Get('jira')
  async getJiraDashboard() {
    try {
      return await this.dashboardService.jiraService.getProjectDashboard();
    } catch (error) {
      throw new HttpException(
        `Failed to fetch JIRA dashboard: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get JIRA tickets with optional filtering
   * GET /api/dashboard/tickets?days=7&status=Open&assignee=john@example.com&search=bug
   */
  @Get('tickets')
  async getJiraTickets(
    @Query('days') days?: string,
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('search') searchText?: string,
  ) {
    try {
      const daysNum = days ? parseInt(days, 10) : undefined;
      return await this.dashboardService.getJiraTickets(
        daysNum,
        status,
        assignee,
        searchText,
      );
    } catch (error) {
      throw new HttpException(
        `Failed to fetch JIRA tickets: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get project users with their roles and information
   * GET /api/dashboard/users?role=developer&activeOnly=true
   */
  @Get('users')
  async getProjectUsers(
    @Query('role') role?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    try {
      return await this.dashboardService.jiraService.getProjectUsers(
        role,
        activeOnly !== 'false',
      );
    } catch (error) {
      throw new HttpException(
        `Failed to fetch project users: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get user workload information
   * GET /api/dashboard/workloads?userIds=user1,user2,user3
   */
  @Get('workloads')
  async getUserWorkloads(@Query('userIds') userIds?: string) {
    try {
      const userAccountIds = userIds ? userIds.split(',') : undefined;
      return await this.dashboardService.getUserWorkloads(userAccountIds);
    } catch (error) {
      throw new HttpException(
        `Failed to fetch user workloads: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get sprint information (if sprints are enabled)
   * GET /api/dashboard/sprints
   */
  @Get('sprints')
  async getSprintInfo() {
    try {
      return await this.dashboardService.getSprintInfo();
    } catch (error) {
      throw new HttpException(
        `Failed to fetch sprint info: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get assignee suggestions for a ticket
   * GET /api/dashboard/suggest-assignee?type=Bug&technologies=javascript,react&priority=High
   */
  @Get('suggest-assignee')
  async suggestAssignee(
    @Query('type') ticketType: string,
    @Query('technologies') technologies?: string,
    @Query('priority') priority?: string,
    @Query('component') component?: string,
  ) {
    try {
      if (!ticketType) {
        throw new HttpException(
          'Ticket type is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const techArray = technologies ? technologies.split(',') : [];
      return await this.dashboardService.jiraService.suggestAssignee(
        ticketType,
        techArray,
        priority || 'Medium',
        component,
      );
    } catch (error) {
      throw new HttpException(
        `Failed to suggest assignee: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get system health status
   * GET /api/dashboard/health
   */
  @Get('health')
  async getHealthStatus() {
    try {
      return await this.dashboardService.getHealthStatus();
    } catch (error) {
      throw new HttpException(
        `Failed to fetch health status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
   * Get project metadata for configuration purposes
   * GET /api/dashboard/project-info
   */
  @Get('project-info')
  async getProjectInfo() {
    try {
      return await this.dashboardService.jiraService.getProjectMetadata();
    } catch (error) {
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
        jira: {
          projectKey:
            this.dashboardService.configService.get<string>('JIRA_PROJECT_KEY'),
          baseUrl:
            this.dashboardService.configService.get<string>('JIRA_BASE_URL'),
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
}
