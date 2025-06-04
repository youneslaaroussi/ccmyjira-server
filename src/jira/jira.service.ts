import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';

export interface JiraConfiguration {
  baseUrl: string;
  projectKey: string;
  cloudId?: string;
  accessToken: string;
  userAccountId: string;
  isDemo?: boolean; // Added this line
}

export interface JiraTicket {
  key: string;
  id: string;
  summary: string;
  description?: string;
  status: string;
  issueType: string;
  assignee?: string;
  assigneeAccountId?: string;
  priority?: string;
  created: string;
  updated: string;
  sprint?: JiraSprint;
  labels?: string[];
  components?: string[];
  storyPoints?: number;
  dueDate?: string;
  reporter?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'future' | 'active' | 'closed';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraUser {
  accountId: string;
  username?: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
  avatarUrls?: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  groups?: string[];
  roles?: string[];
  customFields?: {
    skills?: string[];
    department?: string;
    team?: string;
  };
}

export interface UserWorkload {
  accountId: string;
  username: string;
  displayName: string;
  totalTickets: number;
  inProgressTickets: number;
  todoTickets: number;
  storyPoints: number;
  overdue: number;
}

export interface ProjectDashboard {
  projectInfo: {
    key: string;
    name: string;
    description?: string;
    lead?: JiraUser;
    issueTypes: string[];
    priorities: string[];
    statuses: string[];
  };
  statistics: {
    totalTickets: number;
    openTickets: number;
    closedTickets: number;
    ticketsByType: { [key: string]: number };
    ticketsByStatus: { [key: string]: number };
    ticketsByPriority: { [key: string]: number };
    averageResolutionTime: number; // in days
  };
  recentActivity: {
    recentTickets: JiraTicket[];
    recentComments: any[];
    recentAssignments: any[];
  };
  teamInfo: {
    totalUsers: number;
    activeUsers: number;
    userWorkloads: UserWorkload[];
  };
  sprintInfo?: {
    activeSprints: JiraSprint[];
    upcomingSprints: JiraSprint[];
    completedSprints: JiraSprint[];
  };
}

export interface CreateTicketDto {
  summary: string;
  description: string;
  adfDescription?: any; // Atlassian Document Format for properly formatted descriptions
  issueType: string;
  priority?: string;
  assignee?: string;
  sprintId?: number;
  dueDate?: string;
  labels?: string[];
  components?: string[];
  storyPoints?: number;
  attachments?: Array<{
    name: string;
    content: string; // base64
    contentType: string;
    contentId?: string; // for embedded images
  }>;
}

export interface UpdateTicketDto {
  summary?: string;
  description?: string;
  status?: string;
  assignee?: string;
  comment?: string;
  sprintId?: number;
  dueDate?: string;
  labels?: string[];
  components?: string[];
  storyPoints?: number;
  attachments?: Array<{
    name: string;
    content: string; // base64
    contentType: string;
    contentId?: string; // for embedded images
  }>;
}

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  // Cache for frequently accessed data
  private readonly cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {}

  /**
   * Convert JIRA ADF (Atlassian Document Format) to plain text
   * This removes all formatting and returns clean readable text for the dashboard
   */
  private convertAdfToPlainText(adfContent: any): string {
    if (!adfContent) return '';
    
    // Handle simple string content
    if (typeof adfContent === 'string') {
      return adfContent;
    }
    
    // Handle ADF document structure
    if (adfContent.type === 'doc' && adfContent.content) {
      return this.extractTextFromAdfContent(adfContent.content);
    }
    
    // Handle direct content array
    if (Array.isArray(adfContent)) {
      return this.extractTextFromAdfContent(adfContent);
    }
    
    // Handle simple object with text property
    if (adfContent.text) {
      return adfContent.text;
    }
    
    // Fallback for any other structure
    try {
      return JSON.stringify(adfContent);
    } catch {
      return '';
    }
  }

  /**
   * Recursively extract text from ADF content array
   */
  private extractTextFromAdfContent(content: any[]): string {
    if (!Array.isArray(content)) return '';
    
    const textParts: string[] = [];
    
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        textParts.push(item.text);
      } else if (item.type === 'paragraph' && item.content) {
        textParts.push(this.extractTextFromAdfContent(item.content));
      } else if (item.type === 'heading' && item.content) {
        const headingText = this.extractTextFromAdfContent(item.content);
        textParts.push(`\n${headingText}\n`);
      } else if (item.type === 'bulletList' && item.content) {
        const listItems = this.extractTextFromAdfContent(item.content);
        textParts.push(`\n${listItems}`);
      } else if (item.type === 'listItem' && item.content) {
        const itemText = this.extractTextFromAdfContent(item.content);
        textParts.push(`• ${itemText}\n`);
      } else if (item.type === 'codeBlock' && item.content) {
        const codeText = this.extractTextFromAdfContent(item.content);
        textParts.push(`\n\`\`\`\n${codeText}\n\`\`\`\n`);
      } else if (item.type === 'hardBreak') {
        textParts.push('\n');
      } else if (item.content) {
        // Recursively handle any other content types
        textParts.push(this.extractTextFromAdfContent(item.content));
      } else if (item.text) {
        textParts.push(item.text);
      }
    }
    
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Create HTTP client for specific JIRA configuration
   */
  private createHttpClient(jiraConfig: JiraConfiguration): AxiosInstance {
    this.logger.log(`🔗 Creating JIRA HTTP client. Received Config: ${JSON.stringify(jiraConfig)}`);
    
    // Use Atlassian Cloud API format if cloudId is available, otherwise fallback to site URL
    let baseUrl: string;
    if (jiraConfig.cloudId) {
      baseUrl = `https://api.atlassian.com/ex/jira/${jiraConfig.cloudId}/rest/api/3`;
      this.logger.log(`   Using Cloud API: ${baseUrl}`);
    } else {
      baseUrl = `${jiraConfig.baseUrl}/rest/api/3`;
      this.logger.log(`   Using Site API: ${baseUrl}`);
    }
    
    this.logger.log(`   Token preview: ${jiraConfig.accessToken.substring(0, 20)}...`);
    this.logger.log(`   Project Key: ${jiraConfig.projectKey}`);
    this.logger.log(`   Is Demo: ${jiraConfig.isDemo}`);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Atlassian-Token': 'no-check', // Required for some operations, like file uploads
    };

    if (jiraConfig.isDemo) {
      // Use Basic Auth for demo mode with environment variable credentials
      const demoUserEmail = this.configService.get<string>('DEMO_USER_EMAIL');
      const demoApiToken = jiraConfig.accessToken; // Demo token is passed via accessToken in demoConfig

      if (!demoUserEmail || !demoApiToken) {
        this.logger.error('Demo mode JIRA credentials (email or token) are missing from env or config.');
        throw new Error('Demo mode JIRA credentials are not properly configured.');
      }
      const basicAuthToken = Buffer.from(`${demoUserEmail}:${demoApiToken}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuthToken}`;
      this.logger.log(`   Auth Type: Basic (Demo Mode)`);
      this.logger.log(`   Basic Auth Email: ${demoUserEmail}`);
    } else {
      // Use Bearer token (OAuth) for regular authenticated users
      headers['Authorization'] = `Bearer ${jiraConfig.accessToken}`;
      this.logger.log(`   Auth Type: Bearer (OAuth)`);
    }

    const httpClient = axios.create({
      baseURL: baseUrl,
      headers: headers,
      timeout: parseInt(
        this.configService.get<string>('AI_AGENT_TIMEOUT') || '30000',
      ),
    });

    // Add request interceptor for rate limiting and debugging
    httpClient.interceptors.request.use(async (config) => {
      const delay = parseInt(
        this.configService.get<string>('JIRA_RATE_LIMIT_DELAY') || '1000',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      
      // Add Content-Type here if not already set, especially for POST/PUT
      if (config.method?.toUpperCase() === 'POST' || config.method?.toUpperCase() === 'PUT') {
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }
      }
      this.logger.log(`📤 JIRA API Request: ${config.method?.toUpperCase()} ${config.url}`);
      this.logger.log(`   Authorization: ${config.headers['Authorization']}`);
      // Log Content-Type if it's a POST or PUT request
      if (config.method?.toUpperCase() === 'POST' || config.method?.toUpperCase() === 'PUT') {
        this.logger.log(`   Content-Type: ${config.headers['Content-Type']}`);
      }
      
      return config;
    });

    // Add response interceptor for debugging
    httpClient.interceptors.response.use(
      (response) => {
        this.logger.log(`📥 JIRA API Success: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        this.logger.error(`❌ JIRA API Error: ${error.response?.status} ${error.config?.url}`);
        this.logger.error(`   Error message: ${error.response?.data?.errorMessages || error.message}`);
        this.logger.error(`   Auth used: ${error.config?.headers['Authorization']}`);
        return Promise.reject(error);
      }
    );

    return httpClient;
  }

  /**
   * Get cached data or fetch fresh data
   */
  private async getCachedData<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    ttl: number = this.CACHE_TTL,
  ): Promise<T> {
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    const data = await fetchFunction();
    this.cache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  }

  /**
   * Search for JIRA tickets in a given time period
   */
  async searchTickets(
    jiraConfig: JiraConfiguration,
    daysBack: number = 7,
    status?: string,
    assignee?: string,
    sprintId?: number,
    searchText?: string,
  ): Promise<JiraTicket[]> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - daysBack);
      const dateString = dateFrom.toISOString().split('T')[0];

      let jql = `project = ${jiraConfig.projectKey} AND created >= "${dateString}"`;

      if (status) {
        jql += ` AND status = "${status}"`;
      }

      if (assignee) {
        jql += ` AND assignee = "${assignee}"`;
      }

      if (sprintId) {
        jql += ` AND sprint = ${sprintId}`;
      }

      if (searchText) {
        jql += ` AND (summary ~ "${searchText}" OR description ~ "${searchText}")`;
      }

      jql += ' ORDER BY created DESC';

      this.logger.log(`Searching JIRA tickets with JQL: ${jql}`);

      const response = await httpClient.get('/search', {
        params: {
          jql,
          fields:
            'summary,description,status,issuetype,assignee,priority,created,updated,sprint,labels,components,customfield_10016,duedate,reporter',
          maxResults: 100,
        },
      });

      const tickets = response.data.issues.map((issue: any) => ({
        key: issue.key,
        id: issue.id,
        summary: issue.fields.summary,
        description: this.convertAdfToPlainText(issue.fields.description),
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        assignee:
          issue.fields.assignee?.displayName ||
          issue.fields.assignee?.emailAddress,
        assigneeAccountId: issue.fields.assignee?.accountId,
        priority: issue.fields.priority?.name,
        created: issue.fields.created,
        updated: issue.fields.updated,
        labels: issue.fields.labels || [],
        components: issue.fields.components?.map((c: any) => c.name) || [],
        storyPoints: issue.fields.customfield_10016, // Story Points field
        dueDate: issue.fields.duedate,
        reporter: issue.fields.reporter?.displayName,
        sprint: issue.fields.sprint
          ? {
              id: issue.fields.sprint.id,
              name: issue.fields.sprint.name,
              state: issue.fields.sprint.state?.toLowerCase() || 'unknown',
              startDate: issue.fields.sprint.startDate,
              endDate: issue.fields.sprint.endDate,
              goal: issue.fields.sprint.goal,
            }
          : undefined,
      }));

      this.logger.log(`Found ${tickets.length} JIRA tickets`);
      return tickets;
    } catch (error) {
      this.logger.error(
        'Error searching JIRA tickets:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to search JIRA tickets: ${error.message}`);
    }
  }

  /**
   * Get all users who can be assigned to issues in the project
   */
  async getProjectUsers(
    jiraConfig: JiraConfiguration,
    role?: string,
    activeOnly: boolean = true,
  ): Promise<JiraUser[]> {
    const cacheKey = `project_users_${jiraConfig.projectKey}_${role}_${activeOnly}`;

    return this.getCachedData(cacheKey, async () => {
      try {
        const httpClient = this.createHttpClient(jiraConfig);
        this.logger.log(`Fetching assignable users for project ${jiraConfig.projectKey} (activeOnly: ${activeOnly})`);

        // Use the assignable users API - much simpler and more reliable
        const response = await httpClient.get('/user/assignable/search', {
          params: {
            project: jiraConfig.projectKey,
            maxResults: 1000,
          },
        });

        const allUsers = response.data.map((user: any) => ({
          accountId: user.accountId,
          username: user.name || user.username,
          emailAddress: user.emailAddress || '',
          displayName: user.displayName,
          active: user.active,
          avatarUrls: user.avatarUrls,
          roles: ['Assignable'], // Simple role designation
        }));

        this.logger.log(`📋 Found ${allUsers.length} assignable users from API`);

        // Filter by active status if needed
        const filteredUsers = activeOnly 
          ? allUsers.filter((user: any) => user.active)
          : allUsers;

        // Filter by role if specified (though this is less relevant now)
        const finalUsers = role
          ? filteredUsers.filter((user: any) =>
              user.roles?.some((r: string) =>
                r.toLowerCase().includes(role.toLowerCase()),
              ),
            )
          : filteredUsers;

        this.logger.log(`✅ Final user count: ${finalUsers.length} (activeOnly: ${activeOnly})`);
        
        // If still no users, try the general user search as fallback
        if (finalUsers.length === 0) {
          this.logger.warn('⚠️ No assignable users found, trying general user search...');
          try {
            const searchResponse = await httpClient.get('/user/search', {
              params: {
                query: '',
                maxResults: 50,
              },
            });
            
            const searchUsers = searchResponse.data
              .filter((user: any) => !activeOnly || user.active)
              .map((user: any) => ({
                accountId: user.accountId,
                username: user.name || user.username,
                emailAddress: user.emailAddress || '',
                displayName: user.displayName,
                active: user.active,
                avatarUrls: user.avatarUrls,
                roles: ['General-Search'],
              }));
            
            this.logger.log(`🔍 Fallback search found ${searchUsers.length} users`);
            return searchUsers;
          } catch (searchError) {
            this.logger.warn('Fallback user search failed:', searchError.message);
            return [];
          }
        }

        return finalUsers;
      } catch (error) {
        this.logger.error(
          'Error fetching assignable users:',
          error.response?.data || error.message,
        );
        throw new Error(`Failed to fetch project users: ${error.message}`);
      }
    });
  }

  /**
   * Get workload information for specific users
   */
  async getUserWorkloads(
    jiraConfig: JiraConfiguration,
    userAccountIds: string[],
    includeInProgress: boolean = true,
  ): Promise<{ [accountId: string]: UserWorkload }> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      this.logger.log(`Fetching workloads for ${userAccountIds.length} users`);

      const workloads: { [accountId: string]: UserWorkload } = {};

      for (const accountId of userAccountIds) {
        // Get user info
        const userResponse = await httpClient.get(
          `/user?accountId=${accountId}`,
        );
        const user = userResponse.data;

        // Build JQL for user's tickets
        let jql = `project = ${jiraConfig.projectKey} AND assignee = "${accountId}"`;
        if (includeInProgress) {
          jql += ' AND status NOT IN ("Done", "Closed", "Resolved")';
        }

        const ticketsResponse = await httpClient.get('/search', {
          params: {
            jql,
            fields: 'status,customfield_10016', // status and story points
            maxResults: 1000,
          },
        });

        const tickets = ticketsResponse.data.issues;
        const inProgressTickets = tickets.filter((t: any) =>
          ['In Progress', 'In Development', 'In Review'].includes(
            t.fields.status.name,
          ),
        ).length;

        const todoTickets = tickets.filter((t: any) =>
          ['To Do', 'Open', 'New', 'Backlog'].includes(t.fields.status.name),
        ).length;

        const storyPoints = tickets.reduce(
          (sum: number, ticket: any) =>
            sum + (ticket.fields.customfield_10016 || 0),
          0,
        );

        // Count overdue tickets
        const now = new Date();
        const overdueTickets = tickets.filter((t: any) => {
          const dueDate = t.fields.duedate;
          return (
            dueDate &&
            new Date(dueDate) < now &&
            !['Done', 'Closed', 'Resolved'].includes(t.fields.status.name)
          );
        }).length;

        workloads[accountId] = {
          accountId,
          username: user.name || user.emailAddress,
          displayName: user.displayName,
          totalTickets: tickets.length,
          inProgressTickets,
          todoTickets,
          storyPoints,
          overdue: overdueTickets,
        };
      }

      this.logger.log(
        `Calculated workloads for ${Object.keys(workloads).length} users`,
      );
      return workloads;
    } catch (error) {
      this.logger.error(
        'Error fetching user workloads:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to fetch user workloads: ${error.message}`);
    }
  }

  /**
   * Get user and workload data for AI-powered assignment suggestions
   * No manual scoring - let the AI decide based on raw data
   */
  async suggestAssignee(
    jiraConfig: JiraConfiguration,
    ticketType: string,
    technologies: string[] = [],
    priority: string = 'Medium',
    component?: string,
  ): Promise<{
    users: JiraUser[];
    workloads: { [accountId: string]: UserWorkload };
    context: {
      ticketType: string;
      technologies: string[];
      priority: string;
      component?: string;
    };
  }> {
    try {
      this.logger.log(
        `Getting user data for AI assignment decision: ${ticketType} ticket with priority ${priority}`,
      );

      // Get all users and their workloads - let AI decide who's best
      const users = await this.getProjectUsers(jiraConfig);
      const userAccountIds = users.map((u) => u.accountId);
      const workloads = await this.getUserWorkloads(jiraConfig, userAccountIds);

      this.logger.log(`Retrieved ${users.length} users and workload data for AI decision`);
      
      return {
        users,
        workloads,
        context: {
          ticketType,
          technologies,
          priority,
          component,
        },
      };
    } catch (error) {
      this.logger.error(
        'Error getting user data for assignment:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to get user data for assignment: ${error.message}`);
    }
  }

  /**
   * Get comprehensive project dashboard data
   */
  async getProjectDashboard(jiraConfig: JiraConfiguration): Promise<ProjectDashboard> {
    const cacheKey = `project_dashboard_${jiraConfig.projectKey}`;

    return this.getCachedData(
      cacheKey,
      async () => {
        try {
          const httpClient = this.createHttpClient(jiraConfig);
          this.logger.log(`Fetching project dashboard for ${jiraConfig.projectKey}`);

          // Fetch project metadata
          const projectResponse = await httpClient.get(
            `/project/${jiraConfig.projectKey}`,
          );
          const project = projectResponse.data;

          // Fetch all project tickets for statistics
          const allTicketsResponse = await httpClient.get('/search', {
            params: {
              jql: `project = ${jiraConfig.projectKey}`,
              fields:
                'status,issuetype,priority,created,updated,resolutiondate,assignee',
              maxResults: 1000,
            },
          });

          const allTickets = allTicketsResponse.data.issues;

          // Calculate statistics
          const totalTickets = allTickets.length;
          const openTickets = allTickets.filter(
            (t: any) =>
              !['Done', 'Closed', 'Resolved'].includes(t.fields.status.name),
          ).length;
          const closedTickets = totalTickets - openTickets;

          // Group by various fields
          const ticketsByType: { [key: string]: number } = {};
          const ticketsByStatus: { [key: string]: number } = {};
          const ticketsByPriority: { [key: string]: number } = {};

          let totalResolutionTime = 0;
          let resolvedTicketCount = 0;

          allTickets.forEach((ticket: any) => {
            const type = ticket.fields.issuetype.name;
            const status = ticket.fields.status.name;
            const priority = ticket.fields.priority?.name || 'None';

            ticketsByType[type] = (ticketsByType[type] || 0) + 1;
            ticketsByStatus[status] = (ticketsByStatus[status] || 0) + 1;
            ticketsByPriority[priority] =
              (ticketsByPriority[priority] || 0) + 1;

            // Calculate resolution time
            if (ticket.fields.resolutiondate) {
              const created = new Date(ticket.fields.created);
              const resolved = new Date(ticket.fields.resolutiondate);
              const resolutionTime =
                (resolved.getTime() - created.getTime()) /
                (1000 * 60 * 60 * 24); // days
              totalResolutionTime += resolutionTime;
              resolvedTicketCount++;
            }
          });

          const averageResolutionTime =
            resolvedTicketCount > 0
              ? totalResolutionTime / resolvedTicketCount
              : 0;

          // Get recent tickets
          const recentTickets = await this.searchTickets(jiraConfig, 7);

          // Get users and workloads
          const users = await this.getProjectUsers(jiraConfig);
          const userAccountIds = users.map((u) => u.accountId);
          const workloads = await this.getUserWorkloads(jiraConfig, userAccountIds);

          // Sprint information (if enabled)
          let sprintInfo;
          if (this.configService.get<string>('ENABLE_SPRINTS') === 'true') {
            const [activeSprints, upcomingSprints, completedSprints] =
              await Promise.all([
                this.getSprints(jiraConfig, 'active'),
                this.getSprints(jiraConfig, 'future'),
                this.getSprints(jiraConfig, 'closed'),
              ]);

            sprintInfo = {
              activeSprints,
              upcomingSprints: upcomingSprints.slice(0, 3), // Next 3 sprints
              completedSprints: completedSprints.slice(0, 5), // Last 5 sprints
            };
          }

          const dashboard: ProjectDashboard = {
            projectInfo: {
              key: project.key,
              name: project.name,
              description: project.description,
              lead: users.find((u) => u.accountId === project.lead?.accountId),
              issueTypes: Array.from(
                new Set(
                  allTickets.map((t: any) => t.fields.issuetype.name as string),
                ),
              ),
              priorities: Array.from(
                new Set(
                  allTickets
                    .map((t: any) => t.fields.priority?.name as string)
                    .filter(Boolean),
                ),
              ),
              statuses: Array.from(
                new Set(
                  allTickets.map((t: any) => t.fields.status.name as string),
                ),
              ),
            },
            statistics: {
              totalTickets,
              openTickets,
              closedTickets,
              ticketsByType,
              ticketsByStatus,
              ticketsByPriority,
              averageResolutionTime:
                Math.round(averageResolutionTime * 10) / 10,
            },
            recentActivity: {
              recentTickets: recentTickets.slice(0, 10),
              recentComments: [], // Would need additional API calls
              recentAssignments: [], // Would need additional API calls
            },
            teamInfo: {
              totalUsers: users.length,
              activeUsers: users.filter((u) => u.active).length,
              userWorkloads: Object.values(workloads),
            },
            sprintInfo,
          };

          this.logger.log('Successfully generated project dashboard');
          return dashboard;
        } catch (error) {
          this.logger.error(
            'Error fetching project dashboard:',
            error.response?.data || error.message,
          );
          throw new Error(
            `Failed to fetch project dashboard: ${error.message}`,
          );
        }
      },
      2 * 60 * 1000,
    ); // Cache for 2 minutes
  }

  /**
   * Create a new JIRA ticket
   */
  async createTicket(jiraConfig: JiraConfiguration, ticketData: CreateTicketDto): Promise<JiraTicket> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      this.logger.log(`Creating JIRA ticket: ${ticketData.summary}`);

      // Build core required fields
      const createData: any = {
        fields: {
          project: {
            key: jiraConfig.projectKey,
          },
          summary: ticketData.summary,
          description: ticketData.adfDescription || {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: ticketData.description,
                  },
                ],
              },
            ],
          },
          issuetype: {
            name: ticketData.issueType,
          },
        },
      };

      // Add optional fields only if they have values
      if (ticketData.priority) {
        createData.fields.priority = { name: ticketData.priority };
      }

      if (ticketData.assignee) {
        this.logger.log(`🎯 ASSIGNMENT: Setting assignee to ${ticketData.assignee}`);
        createData.fields.assignee = { accountId: ticketData.assignee };
      } else {
        this.logger.warn(`⚠️ ASSIGNMENT: No assignee provided, ticket will be unassigned`);
      }

      if (ticketData.dueDate) {
        createData.fields.duedate = ticketData.dueDate;
      }

      // Try to add optional array fields - these might not be configured
      if (ticketData.labels && ticketData.labels.length > 0) {
        createData.fields.labels = ticketData.labels;
      }

      if (ticketData.components && ticketData.components.length > 0) {
        createData.fields.components = ticketData.components.map((name) => ({ name }));
      }

      if (ticketData.storyPoints) {
        createData.fields.customfield_10016 = ticketData.storyPoints; // Story Points field
      }

      try {
        this.logger.log(`📤 Creating ticket with fields: ${Object.keys(createData.fields).join(', ')}`);
        this.logger.log(`📋 Full ticket data being sent to JIRA:`);
        this.logger.log(`   Summary: ${createData.fields.summary}`);
        this.logger.log(`   Issue Type: ${createData.fields.issuetype.name}`);
        this.logger.log(`   Priority: ${createData.fields.priority?.name || 'None'}`);
        this.logger.log(`   Assignee: ${createData.fields.assignee?.accountId || 'Unassigned'}`);
        this.logger.log(`   Project: ${createData.fields.project.key}`);
        
        const response = await httpClient.post('/issue', createData);
        const newTicket = response.data;
        this.logger.log(`✅ Successfully created JIRA ticket: ${newTicket.key}`);
        
        // Verify assignment was successful
        if (ticketData.assignee) {
          this.logger.log(`🔍 Verifying assignment for ticket ${newTicket.key}...`);
          try {
            const checkResponse = await httpClient.get(`/issue/${newTicket.key}?fields=assignee`);
            const actualAssignee = checkResponse.data.fields.assignee;
            if (actualAssignee && actualAssignee.accountId === ticketData.assignee) {
              this.logger.log(`✅ ASSIGNMENT VERIFIED: Ticket ${newTicket.key} successfully assigned to ${actualAssignee.displayName} (${actualAssignee.accountId})`);
            } else {
              this.logger.error(`❌ ASSIGNMENT FAILED: Ticket ${newTicket.key} shows assignee as ${actualAssignee?.displayName || 'UNASSIGNED'} (${actualAssignee?.accountId || 'NO-ID'}), expected ${ticketData.assignee}`);
            }
          } catch (checkError) {
            this.logger.error(`❌ Failed to verify assignment for ticket ${newTicket.key}: ${checkError.message}`);
          }
        }

        // Upload attachments after ticket creation
        if (ticketData.attachments && ticketData.attachments.length > 0) {
          try {
            await this.uploadAttachments(jiraConfig, newTicket.key, ticketData.attachments);
          } catch (attachmentError) {
            this.logger.warn(
              `Failed to upload attachments to ticket ${newTicket.key}: ${attachmentError.message}`,
            );
            // Don't fail the entire ticket creation if attachments fail
          }
        }

        // If sprint is specified and sprints are enabled, add to sprint
        if (
          ticketData.sprintId &&
          this.configService.get<string>('ENABLE_SPRINTS') === 'true'
        ) {
          try {
            await this.addTicketToSprint(jiraConfig, newTicket.key, ticketData.sprintId);
          } catch (sprintError) {
            this.logger.warn(
              `Failed to add ticket to sprint: ${sprintError.message}`,
            );
          }
        }

        // Clear cache
        this.cache.delete(`project_dashboard_${jiraConfig.projectKey}`);

        return {
          key: newTicket.key,
          id: newTicket.id,
          summary: ticketData.summary,
          description: ticketData.description,
          status: 'To Do', // Default status
          issueType: ticketData.issueType,
          assignee: ticketData.assignee,
          priority: ticketData.priority,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          labels: ticketData.labels,
          components: ticketData.components,
          storyPoints: ticketData.storyPoints,
          dueDate: ticketData.dueDate,
        };
      } catch (createError) {
        // If the creation failed due to field issues, try again with just core fields
        if (createError.response?.status === 400 && createError.response?.data?.errors) {
          this.logger.warn(`❌ Ticket creation failed with field errors: ${JSON.stringify(createError.response.data.errors)}`);
          this.logger.log(`🔄 Retrying with core fields only...`);
          
          // Strip out problematic fields and retry with minimal data
          const coreData = {
            fields: {
              project: { key: jiraConfig.projectKey },
              summary: ticketData.summary,
              description: createData.fields.description,
              issuetype: { name: ticketData.issueType },
              ...(ticketData.priority && { priority: { name: ticketData.priority } }),
              ...(ticketData.assignee && { assignee: { accountId: ticketData.assignee } }),
            },
          };
          
          const retryResponse = await httpClient.post('/issue', coreData);
          const newTicket = retryResponse.data;
          this.logger.log(`✅ Successfully created JIRA ticket (retry): ${newTicket.key}`);
          
          // Clear cache
          this.cache.delete(`project_dashboard_${jiraConfig.projectKey}`);
          
          return {
            key: newTicket.key,
            id: newTicket.id,
            summary: ticketData.summary,
            description: ticketData.description,
            status: 'To Do',
            issueType: ticketData.issueType,
            assignee: ticketData.assignee,
            priority: ticketData.priority,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            labels: [],
            components: [],
          };
        }
        
        throw createError;
      }
    } catch (error) {
      this.logger.error(
        'Error creating JIRA ticket:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to create JIRA ticket: ${error.message}`);
    }
  }

  /**
   * Update an existing JIRA ticket
   */
  async updateTicket(
    jiraConfig: JiraConfiguration,
    ticketKey: string,
    updateData: UpdateTicketDto,
  ): Promise<void> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      this.logger.log(`Updating JIRA ticket: ${ticketKey}`);

      const updateFields: any = {};

      if (updateData.summary) {
        updateFields.summary = updateData.summary;
      }

      if (updateData.description) {
        updateFields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: updateData.description,
                },
              ],
            },
          ],
        };
      }

      if (updateData.assignee) {
        updateFields.assignee = { accountId: updateData.assignee };
      }

      if (updateData.labels) {
        updateFields.labels = updateData.labels;
      }

      if (updateData.components) {
        updateFields.components = updateData.components.map((name) => ({
          name,
        }));
      }

      if (updateData.storyPoints !== undefined) {
        updateFields.customfield_10016 = updateData.storyPoints;
      }

      if (updateData.dueDate) {
        updateFields.duedate = updateData.dueDate;
      }

      // Update fields
      if (Object.keys(updateFields).length > 0) {
        await httpClient.put(`/issue/${ticketKey}`, {
          fields: updateFields,
        });
      }

      // Handle status transition
      if (updateData.status) {
        await this.transitionTicket(jiraConfig, ticketKey, updateData.status);
      }

      // Add comment if provided
      if (updateData.comment) {
        await this.addComment(jiraConfig, ticketKey, updateData.comment);
      }

      // Upload attachments if provided
      if (updateData.attachments && updateData.attachments.length > 0) {
        try {
          await this.uploadAttachments(jiraConfig, ticketKey, updateData.attachments);
        } catch (attachmentError) {
          this.logger.warn(
            `Failed to upload attachments to ticket ${ticketKey}: ${attachmentError.message}`,
          );
          // Don't fail the entire update if attachments fail
        }
      }

      // Handle sprint assignment
      if (
        updateData.sprintId &&
        this.configService.get<string>('ENABLE_SPRINTS') === 'true'
      ) {
        await this.addTicketToSprint(jiraConfig, ticketKey, updateData.sprintId);
      }

      // Clear cache
      this.cache.delete(`project_dashboard_${jiraConfig.projectKey}`);

      this.logger.log(`Successfully updated JIRA ticket: ${ticketKey}`);
    } catch (error) {
      this.logger.error(
        `Error updating JIRA ticket ${ticketKey}:`,
        error.response?.data || error.message,
      );
      throw new Error(`Failed to update JIRA ticket: ${error.message}`);
    }
  }

  private async transitionTicket(
    jiraConfig: JiraConfiguration,
    ticketKey: string,
    newStatus: string,
  ): Promise<void> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      const transitionsResponse = await httpClient.get(
        `/issue/${ticketKey}/transitions`,
      );
      const transitions = transitionsResponse.data.transitions;

      const targetTransition = transitions.find(
        (t: any) => t.to.name.toLowerCase() === newStatus.toLowerCase(),
      );

      if (!targetTransition) {
        throw new Error(`No transition available to status: ${newStatus}`);
      }

      await httpClient.post(`/issue/${ticketKey}/transitions`, {
        transition: {
          id: targetTransition.id,
        },
      });

      this.logger.log(`Transitioned ticket ${ticketKey} to ${newStatus}`);
    } catch (error) {
      this.logger.error(
        `Error transitioning ticket ${ticketKey}:`,
        error.message,
      );
      throw error;
    }
  }

  private async addComment(jiraConfig: JiraConfiguration, ticketKey: string, comment: string): Promise<void> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      await httpClient.post(`/issue/${ticketKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      });

      this.logger.log(`Added comment to ticket ${ticketKey}`);
    } catch (error) {
      this.logger.error(
        `Error adding comment to ticket ${ticketKey}:`,
        error.message,
      );
      throw error;
    }
  }

  async getProjectMetadata(jiraConfig: JiraConfiguration): Promise<any> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      const response = await httpClient.get(`/project/${jiraConfig.projectKey}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching project metadata:', error.message);
      throw new Error(`Failed to fetch project metadata: ${error.message}`);
    }
  }

  async getSprints(
    jiraConfig: JiraConfiguration,
    state?: 'future' | 'active' | 'closed',
  ): Promise<JiraSprint[]> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      // This assumes you're using Jira Software (not Core) and have access to the agile/board API
      // You might need to adjust this based on your Jira setup

      // First, get the board ID for the project
      const boardsResponse = await httpClient.get(
        `/board?projectKeyOrId=${jiraConfig.projectKey}`,
        {
          baseURL: `${jiraConfig.baseUrl}/rest/agile/1.0`,
        },
      );

      if (
        !boardsResponse.data.values ||
        boardsResponse.data.values.length === 0
      ) {
        this.logger.warn(`No boards found for project ${jiraConfig.projectKey}`);
        return [];
      }

      const boardId = boardsResponse.data.values[0].id;

      let url = `/board/${boardId}/sprint`;
      if (state) {
        url += `?state=${state}`;
      }

      const sprintsResponse = await httpClient.get(url, {
        baseURL: `${jiraConfig.baseUrl}/rest/agile/1.0`,
      });

      const sprints = sprintsResponse.data.values.map((sprint: any) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state.toLowerCase(),
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal,
      }));

      this.logger.log(
        `Found ${sprints.length} sprints for project ${jiraConfig.projectKey}`,
      );
      return sprints;
    } catch (error) {
      this.logger.error(
        'Error fetching sprints:',
        error.response?.data || error.message,
      );
      return []; // Return empty array instead of throwing for optional feature
    }
  }

  async getActiveSprint(jiraConfig: JiraConfiguration): Promise<JiraSprint | null> {
    try {
      const activeSprints = await this.getSprints(jiraConfig, 'active');
      return activeSprints.length > 0 ? activeSprints[0] : null;
    } catch (error) {
      this.logger.error('Error fetching active sprint:', error.message);
      return null;
    }
  }

  private async addTicketToSprint(
    jiraConfig: JiraConfiguration,
    ticketKey: string,
    sprintId: number,
  ): Promise<void> {
    try {
      const httpClient = this.createHttpClient(jiraConfig);
      await httpClient.post(
        `/sprint/${sprintId}/issue`,
        {
          issues: [ticketKey],
        },
        {
          baseURL: `${jiraConfig.baseUrl}/rest/agile/1.0`,
        },
      );

      this.logger.log(`Added ticket ${ticketKey} to sprint ${sprintId}`);
    } catch (error) {
      this.logger.error(
        `Error adding ticket to sprint:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Cleared JIRA service cache');
  }

  /**
   * Upload attachments to a Jira ticket
   */
  async uploadAttachments(
    jiraConfig: JiraConfiguration,
    issueKey: string,
    attachments: Array<{
      name: string;
      content: string; // base64
      contentType: string;
      contentId?: string;
    }>
  ): Promise<void> {
    if (!attachments || attachments.length === 0) {
      return;
    }

    try {
      const httpClient = this.createHttpClient(jiraConfig);
      this.logger.log(`Uploading ${attachments.length} attachments to JIRA ticket: ${issueKey}`);

      for (const attachment of attachments) {
        await this.uploadSingleAttachment(httpClient, issueKey, attachment);
      }

      this.logger.log(`Successfully uploaded all attachments to JIRA ticket: ${issueKey}`);
    } catch (error) {
      this.logger.error(
        `Error uploading attachments to JIRA ticket ${issueKey}:`,
        error.response?.data || error.message,
      );
      throw new Error(`Failed to upload attachments: ${error.message}`);
    }
  }

  /**
   * Upload a single attachment to a Jira ticket
   */
  private async uploadSingleAttachment(
    httpClient: AxiosInstance,
    issueKey: string,
    attachment: {
      name: string;
      content: string; // base64
      contentType: string;
      contentId?: string;
    }
  ): Promise<void> {
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(attachment.content, 'base64');
      
      // Create form data
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: attachment.name,
        contentType: attachment.contentType,
      });

      this.logger.log(`Uploading attachment: ${attachment.name} (${attachment.contentType}) to ${issueKey}`);

      // Upload to Jira
      const response = await httpClient.post(`/issue/${issueKey}/attachments`, formData, {
        headers: {
          'X-Atlassian-Token': 'no-check',
          ...formData.getHeaders(),
        },
        maxContentLength: 10 * 1024 * 1024, // 10MB limit
        maxBodyLength: 10 * 1024 * 1024, // 10MB limit
      });

      this.logger.log(`Successfully uploaded attachment: ${attachment.name} to ${issueKey}`);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to upload attachment ${attachment.name}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Process embedded images from HTML content and convert them to attachments
   */
  processEmbeddedImages(
    htmlContent: string,
    attachments: Array<{
      name: string;
      content: string;
      contentType: string;
      contentId?: string;
    }>
  ): {
    processedHtml: string;
    embeddedImages: Array<{
      name: string;
      content: string;
      contentType: string;
      contentId?: string;
    }>;
  } {
    if (!htmlContent || !attachments || attachments.length === 0) {
      return {
        processedHtml: htmlContent || '',
        embeddedImages: [],
      };
    }

    let processedHtml = htmlContent;
    const embeddedImages: typeof attachments = [];

    // Find embedded images referenced by Content-ID
    for (const attachment of attachments) {
      if (attachment.contentId && attachment.contentType?.startsWith('image/')) {
        // Look for cid: references in HTML
        const cidPattern = new RegExp(`cid:${attachment.contentId.replace(/[<>]/g, '')}`, 'gi');
        
        if (processedHtml.match(cidPattern)) {
          embeddedImages.push(attachment);
          
          // Replace cid: references with a note about the attached image
          processedHtml = processedHtml.replace(
            cidPattern,
            `[Embedded Image: ${attachment.name}]`
          );
          
          this.logger.log(`Found embedded image: ${attachment.name} (${attachment.contentId})`);
        }
      }
    }

    return {
      processedHtml,
      embeddedImages,
    };
  }
}
