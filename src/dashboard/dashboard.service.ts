import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JiraService, ProjectDashboard } from '../jira/jira.service';

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
    @InjectQueue('email-processing') public readonly emailQueue: Queue,
  ) {}

  /**
   * Get comprehensive dashboard data including system stats and JIRA information
   */
  async getDashboardData(): Promise<DashboardData> {
    try {
      this.logger.log('Fetching comprehensive dashboard data');

      const [systemStats, jiraData] = await Promise.all([
        this.getSystemStats(),
        this.jiraService.getProjectDashboard(),
      ]);

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
  async getProjectUsers() {
    return this.jiraService.getProjectUsers();
  }

  /**
   * Get JIRA tickets with optional filtering
   */
  async getJiraTickets(
    days?: number,
    status?: string,
    assignee?: string,
    searchText?: string,
  ) {
    return this.jiraService.searchTickets(
      days,
      status,
      assignee,
      undefined,
      searchText,
    );
  }

  /**
   * Get sprint information (if sprints are enabled)
   */
  async getSprintInfo() {
    if (this.configService.get<string>('ENABLE_SPRINTS') !== 'true') {
      return { error: 'Sprint functionality is disabled' };
    }

    const [activeSprints, upcomingSprints, completedSprints] =
      await Promise.all([
        this.jiraService.getSprints('active'),
        this.jiraService.getSprints('future'),
        this.jiraService.getSprints('closed'),
      ]);

    return {
      activeSprints,
      upcomingSprints: upcomingSprints.slice(0, 3),
      completedSprints: completedSprints.slice(0, 5),
    };
  }

  /**
   * Get user workload information
   */
  async getUserWorkloads(userAccountIds?: string[]) {
    if (!userAccountIds) {
      const users = await this.jiraService.getProjectUsers();
      userAccountIds = users.map((u) => u.accountId);
    }

    return this.jiraService.getUserWorkloads(userAccountIds);
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
  async getHealthStatus() {
    try {
      const [queueHealth, jiraHealth] = await Promise.all([
        this.checkQueueHealth(),
        this.checkJiraHealth(),
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

  private async checkJiraHealth() {
    try {
      await this.jiraService.getProjectMetadata();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}
