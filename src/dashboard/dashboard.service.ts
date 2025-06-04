import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JiraService, ProjectDashboard, JiraConfiguration } from '../jira/jira.service';
import { JiraConfigService } from '../jira/jira-config.service';

export interface SystemStats {
  server: {
    uptime: number;
    timestamp: string;
    nodeVersion: string;
    environment: string;
  };
  queue: {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  };
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  processing: {
    totalJobsProcessed: number;
    averageProcessingTime: number;
    successRate: number;
  };
}

export interface DashboardData {
  systemStats: SystemStats;
  jiraData: ProjectDashboard;
  lastUpdated: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    public readonly configService: ConfigService,
    public readonly jiraService: JiraService,
    private readonly jiraConfigService: JiraConfigService,
    @InjectQueue('email-processing') public readonly emailQueue: Queue,
  ) {}

  /**
   * Get comprehensive dashboard data including system stats and JIRA information
   */
  async getDashboardData(userId?: string, organizationId?: string): Promise<DashboardData> {
    try {
      this.logger.log('Fetching comprehensive dashboard data');

      // Always get system stats
      const systemStats = await this.getSystemStats();

      // Try to get JIRA data, but handle gracefully if not configured
      let jiraData: ProjectDashboard;
      try {
        if (userId && organizationId) {
          const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
          jiraData = await this.jiraService.getProjectDashboard(jiraConfig);
        } else {
          this.logger.log('No user/organization context - returning empty dashboard data for onboarding');
          jiraData = this.getEmptyDashboardData('No User Context', 'Please authenticate and select an organization to view JIRA data');
        }
      } catch (error) {
        this.logger.warn('JIRA data unavailable, using fallback data:', error.message);
        jiraData = this.getEmptyDashboardData('JIRA Unavailable', `JIRA connection unavailable: ${error.message}`);
      }

      return {
        systemStats,
        jiraData,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error fetching dashboard data:', error.message);
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }
  }

  private getEmptyDashboardData(title: string, description: string): ProjectDashboard {
    return {
      projectInfo: {
        key: '',
        name: title,
        description: description,
        issueTypes: [],
        priorities: [],
        statuses: []
      },
      statistics: {
        totalTickets: 0,
        openTickets: 0,
        closedTickets: 0,
        ticketsByType: {},
        ticketsByStatus: {},
        ticketsByPriority: {},
        averageResolutionTime: 0
      },
      recentActivity: {
        recentTickets: [],
        recentComments: [],
        recentAssignments: []
      },
      teamInfo: {
        totalUsers: 0,
        activeUsers: 0,
        userWorkloads: []
      }
    };
  }

  /**
   * Get system statistics including queue, memory, and processing metrics
   */
  async getSystemStats(): Promise<SystemStats> {
    try {
      // Get queue statistics
      const queueStats = await this.getQueueStats();

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory =
        memoryUsage.heapTotal + memoryUsage.external + memoryUsage.arrayBuffers;
      const usedMemory = memoryUsage.heapUsed;
      const freeMemory = totalMemory - usedMemory;

      // Get processing statistics
      const processingStats = await this.getProcessingStats();

      return {
        server: {
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          environment:
            this.configService.get<string>('NODE_ENV') || 'development',
        },
        queue: queueStats,
        memory: {
          used: Math.round(usedMemory / 1024 / 1024), // MB
          free: Math.round(freeMemory / 1024 / 1024), // MB
          total: Math.round(totalMemory / 1024 / 1024), // MB
          percentage: Math.round((usedMemory / totalMemory) * 100),
        },
        processing: processingStats,
      };
    } catch (error) {
      this.logger.error('Error fetching system stats:', error.message);
      throw new Error(`Failed to fetch system stats: ${error.message}`);
    }
  }

  /**
   * Get queue-specific statistics
   */
  private async getQueueStats(): Promise<SystemStats['queue']> {
    try {
      const waiting = await this.emailQueue.getWaiting();
      const active = await this.emailQueue.getActive();
      const completed = await this.emailQueue.getCompleted();
      const failed = await this.emailQueue.getFailed();
      const delayed = await this.emailQueue.getDelayed();

      return {
        name: 'email-processing',
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: await this.emailQueue.isPaused(),
      };
    } catch (error) {
      this.logger.warn('Error fetching queue stats:', error.message);
      return {
        name: 'email-processing',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
      };
    }
  }

  /**
   * Get processing performance statistics
   */
  private async getProcessingStats(): Promise<SystemStats['processing']> {
    try {
      const completed = await this.emailQueue.getCompleted(0, 100); // Last 100 jobs
      const failed = await this.emailQueue.getFailed(0, 100); // Last 100 failed jobs

      const totalProcessed = completed.length + failed.length;
      const successRate =
        totalProcessed > 0 ? (completed.length / totalProcessed) * 100 : 0;

      // Calculate average processing time from completed jobs
      let totalProcessingTime = 0;
      let jobsWithTime = 0;

      completed.forEach((job) => {
        if (job.processedOn && job.timestamp) {
          totalProcessingTime += job.processedOn - job.timestamp;
          jobsWithTime++;
        }
      });

      const averageProcessingTime =
        jobsWithTime > 0 ? Math.round(totalProcessingTime / jobsWithTime) : 0;

      return {
        totalJobsProcessed: totalProcessed,
        averageProcessingTime, // in milliseconds
        successRate: Math.round(successRate),
      };
    } catch (error) {
      this.logger.warn('Error fetching processing stats:', error.message);
      return {
        totalJobsProcessed: 0,
        averageProcessingTime: 0,
        successRate: 0,
      };
    }
  }

  /**
   * Get JIRA project users with their current workloads
   */
  async getProjectUsers(userId: string, organizationId: string) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      return await this.jiraService.getProjectUsers(jiraConfig);
    } catch (error) {
      this.logger.warn('Error fetching project users:', error.message);
      return [];
    }
  }

  /**
   * Get JIRA tickets with optional filtering
   */
  async getJiraTickets(
    userId: string,
    organizationId: string,
    days?: number,
    status?: string,
    assignee?: string,
    searchText?: string,
    includeAttachmentContent: boolean = false, // Default to false for performance
  ) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      return await this.jiraService.searchTickets(
        jiraConfig,
        days,
        status,
        assignee,
        undefined,
        searchText,
        includeAttachmentContent,
      );
    } catch (error) {
      this.logger.warn('Error fetching JIRA tickets:', error.message);
      return [];
    }
  }

  /**
   * Get sprint information (if sprints are enabled)
   */
  async getSprintInfo(userId: string, organizationId: string) {
    try {
      if (this.configService.get<string>('ENABLE_SPRINTS') !== 'true') {
        return { 
          error: 'Sprint functionality is disabled',
          activeSprints: [],
          upcomingSprints: [],
          completedSprints: []
        };
      }

      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      const [activeSprints, upcomingSprints, completedSprints] =
        await Promise.all([
          this.jiraService.getSprints(jiraConfig, 'active'),
          this.jiraService.getSprints(jiraConfig, 'future'),
          this.jiraService.getSprints(jiraConfig, 'closed'),
        ]);

      return {
        activeSprints,
        upcomingSprints: upcomingSprints.slice(0, 3),
        completedSprints: completedSprints.slice(0, 5),
      };
    } catch (error) {
      this.logger.warn('Error fetching sprint info:', error.message);
      return {
        activeSprints: [],
        upcomingSprints: [],
        completedSprints: [],
        error: error.message
      };
    }
  }

  /**
   * Get user workload information
   */
  async getUserWorkloads(userId: string, organizationId: string, userAccountIds?: string[]) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);

      if (!userAccountIds) {
        const users = await this.jiraService.getProjectUsers(jiraConfig);
        userAccountIds = users.map((u) => u.accountId);
      }

      return await this.jiraService.getUserWorkloads(jiraConfig, userAccountIds);
    } catch (error) {
      this.logger.warn('Error fetching user workloads:', error.message);
      return {};
    }
  }

  /**
   * Get a specific JIRA ticket with attachments
   */
  async getJiraTicketWithAttachments(
    userId: string,
    organizationId: string,
    ticketKey: string,
  ) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      
      // Search for the specific ticket with attachments
      const tickets = await this.jiraService.searchTickets(
        jiraConfig,
        365, // Search in the last year to find the ticket
        undefined,
        undefined,
        undefined,
        `key = ${ticketKey}`,
        true, // Include attachment content
      );
      
      return tickets.length > 0 ? tickets[0] : null;
    } catch (error) {
      this.logger.warn(`Error fetching JIRA ticket ${ticketKey}:`, error.message);
      return null;
    }
  }

  /**
   * Get project metadata
   */
  async getProjectMetadata(userId: string, organizationId: string) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      return await this.jiraService.getProjectMetadata(jiraConfig);
    } catch (error) {
      this.logger.warn('Error fetching project metadata:', error.message);
      throw error;
    }
  }

  /**
   * Clear all caches to force fresh data
   */
  async refreshCaches() {
    this.jiraService.clearCache();
    this.logger.log('Cleared all caches');
    return { success: true, message: 'Caches cleared successfully' };
  }

  /**
   * Get system health status
   */
  async getHealthStatus(userId?: string, organizationId?: string) {
    try {
      const [queueHealth, jiraHealth] = await Promise.all([
        this.checkQueueHealth(),
        this.checkJiraHealth(userId, organizationId),
      ]);

      const overall =
        queueHealth.healthy && jiraHealth.healthy ? 'healthy' : 'unhealthy';

      return {
        status: overall,
        timestamp: new Date().toISOString(),
        checks: {
          queue: queueHealth,
          jira: jiraHealth,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        checks: {
          queue: { healthy: false, error: 'Unknown' },
          jira: { healthy: false, error: 'Unknown' },
        },
      };
    }
  }

  private async checkQueueHealth() {
    try {
      await this.emailQueue.getWaiting();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  private async checkJiraHealth(userId?: string, organizationId?: string) {
    try {
      if (!userId || !organizationId) {
        return { healthy: false, error: 'No user/organization context' };
      }
      
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId);
      await this.jiraService.getProjectMetadata(jiraConfig);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}
 