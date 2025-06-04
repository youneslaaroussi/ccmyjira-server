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
  async getDashboardData(userId?: string, organizationId?: string, isDemo: boolean = false): Promise<DashboardData> {
    try {
      this.logger.log(`Fetching comprehensive dashboard data (demo: ${isDemo})`);

      // Always get system stats
      const systemStats = await this.getSystemStats();

      // Try to get JIRA data, but handle gracefully if not configured
      let jiraData: ProjectDashboard;
      try {
        if (userId && organizationId) {
          const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
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
   * Get JIRA project users with role filtering
   */
  async getProjectUsers(userId: string, organizationId: string, isDemo: boolean = false) {
    const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
    return await this.jiraService.getProjectUsers(jiraConfig);
  }

  /**
   * Get JIRA tickets with filtering
   */
  async getJiraTickets(
    userId: string,
    organizationId: string,
    isDemo: boolean = false,
    days?: number,
    status?: string,
    assignee?: string,
    searchText?: string,
  ) {
    const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
    return await this.jiraService.searchTickets(
      jiraConfig,
      days,
      status,
      assignee,
      undefined, // sprintId
      searchText,
    );
  }

  /**
   * Get sprint information for the project
   */
  async getSprintInfo(userId: string, organizationId: string, isDemo: boolean = false) {
    try {
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
      
      // Get all sprint states
      const [activeSprints, futureSprints, closedSprints] = await Promise.all([
        this.jiraService.getSprints(jiraConfig, 'active'),
        this.jiraService.getSprints(jiraConfig, 'future'),
        this.jiraService.getSprints(jiraConfig, 'closed'),
      ]);

      return {
        success: true,
        data: {
          activeSprints,
          futureSprints,
          closedSprints: closedSprints.slice(0, 5), // Limit to last 5 closed sprints
          totalActive: activeSprints.length,
          totalFuture: futureSprints.length,
          totalClosed: closedSprints.length,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching sprint info:', error.message);
      return {
        success: false,
        error: error.message,
        data: {
          activeSprints: [],
          futureSprints: [],
          closedSprints: [],
          totalActive: 0,
          totalFuture: 0,
          totalClosed: 0,
        },
      };
    }
  }

  /**
   * Get user workload information
   */
  async getUserWorkloads(userId: string, organizationId: string, isDemo: boolean = false, userAccountIds?: string[]) {
    const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
    
    if (!userAccountIds) {
      // Get all project users if no specific IDs provided
      const users = await this.jiraService.getProjectUsers(jiraConfig);
      userAccountIds = users.map(user => user.accountId);
    }
    
    return await this.jiraService.getUserWorkloads(jiraConfig, userAccountIds);
  }

  /**
   * Get project metadata
   */
  async getProjectMetadata(userId: string, organizationId: string, isDemo: boolean = false) {
    const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
    return await this.jiraService.getProjectMetadata(jiraConfig);
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
  async getHealthStatus(userId?: string, organizationId?: string, isDemo: boolean = false) {
    try {
      const [queueHealth, jiraHealth] = await Promise.all([
        this.checkQueueHealth(),
        this.checkJiraHealth(userId, organizationId, isDemo),
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

  private async checkJiraHealth(userId?: string, organizationId?: string, isDemo: boolean = false) {
    try {
      if (!userId || !organizationId) {
        return { healthy: false, error: 'No user/organization context' };
      }
      
      const jiraConfig = await this.jiraConfigService.getJiraConfig(userId, organizationId, isDemo);
      await this.jiraService.getProjectMetadata(jiraConfig);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}
 