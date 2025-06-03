import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

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
  issueType: string;
  priority?: string;
  assignee?: string;
  sprintId?: number;
  dueDate?: string;
  labels?: string[];
  components?: string[];
  storyPoints?: number;
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
}

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;
  private readonly projectKey: string;

  // Cache for frequently accessed data
  private readonly cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL') || '';
    this.projectKey = this.configService.get<string>('JIRA_PROJECT_KEY') || '';

    if (!this.baseUrl || !this.projectKey) {
      this.logger.error(
        'JIRA configuration missing: JIRA_BASE_URL and JIRA_PROJECT_KEY are required',
      );
    }

    this.httpClient = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
      auth: {
        username: this.configService.get<string>('JIRA_USERNAME') || '',
        password: this.configService.get<string>('JIRA_API_TOKEN') || '',
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: parseInt(
        this.configService.get<string>('AI_AGENT_TIMEOUT') || '30000',
      ),
    });

    // Add request interceptor for rate limiting
    this.httpClient.interceptors.request.use(async (config) => {
      const delay = parseInt(
        this.configService.get<string>('JIRA_RATE_LIMIT_DELAY') || '1000',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return config;
    });
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
    daysBack: number = 7,
    status?: string,
    assignee?: string,
    sprintId?: number,
    searchText?: string,
  ): Promise<JiraTicket[]> {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - daysBack);
      const dateString = dateFrom.toISOString().split('T')[0];

      let jql = `project = ${this.projectKey} AND created >= "${dateString}"`;

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

      const response = await this.httpClient.get('/search', {
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
        description:
          issue.fields.description?.content?.[0]?.content?.[0]?.text || '',
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
   * Get all users who have access to the project
   */
  async getProjectUsers(
    role?: string,
    activeOnly: boolean = true,
  ): Promise<JiraUser[]> {
    const cacheKey = `project_users_${this.projectKey}_${role}_${activeOnly}`;

    return this.getCachedData(cacheKey, async () => {
      try {
        this.logger.log(`Fetching project users for ${this.projectKey}`);

        // Get project role members
        const projectResponse = await this.httpClient.get(
          `/project/${this.projectKey}/role`,
        );
        const roles = projectResponse.data;

        const allUsers = new Map<string, JiraUser>();

        // Fetch users from each role
        for (const [roleName, roleUrl] of Object.entries(roles)) {
          try {
            const roleResponse = await this.httpClient.get(roleUrl as string);
            const actors = roleResponse.data.actors || [];

            for (const actor of actors) {
              if (
                actor.type === 'atlassian-user-role-actor' &&
                actor.actorUser
              ) {
                const user = actor.actorUser;
                if (!activeOnly || user.active) {
                  allUsers.set(user.accountId, {
                    accountId: user.accountId,
                    username: user.name,
                    emailAddress: user.emailAddress,
                    displayName: user.displayName,
                    active: user.active,
                    avatarUrls: user.avatarUrls,
                    roles: [
                      ...(allUsers.get(user.accountId)?.roles || []),
                      roleName,
                    ],
                  });
                }
              }
            }
          } catch (roleError) {
            this.logger.warn(
              `Failed to fetch role ${roleName}:`,
              roleError.message,
            );
          }
        }

        const users = Array.from(allUsers.values());

        // Filter by role if specified
        const filteredUsers = role
          ? users.filter((user) =>
              user.roles?.some((r) =>
                r.toLowerCase().includes(role.toLowerCase()),
              ),
            )
          : users;

        this.logger.log(`Found ${filteredUsers.length} project users`);
        return filteredUsers;
      } catch (error) {
        this.logger.error(
          'Error fetching project users:',
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
    userAccountIds: string[],
    includeInProgress: boolean = true,
  ): Promise<{ [accountId: string]: UserWorkload }> {
    try {
      this.logger.log(`Fetching workloads for ${userAccountIds.length} users`);

      const workloads: { [accountId: string]: UserWorkload } = {};

      for (const accountId of userAccountIds) {
        // Get user info
        const userResponse = await this.httpClient.get(
          `/user?accountId=${accountId}`,
        );
        const user = userResponse.data;

        // Build JQL for user's tickets
        let jql = `project = ${this.projectKey} AND assignee = "${accountId}"`;
        if (includeInProgress) {
          jql += ' AND status NOT IN ("Done", "Closed", "Resolved")';
        }

        const ticketsResponse = await this.httpClient.get('/search', {
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
   * Suggest the best assignee for a ticket based on various factors
   */
  async suggestAssignee(
    ticketType: string,
    technologies: string[] = [],
    priority: string = 'Medium',
    component?: string,
  ): Promise<{
    suggestions: Array<{ user: JiraUser; score: number; reasoning: string[] }>;
  }> {
    try {
      this.logger.log(
        `Suggesting assignee for ${ticketType} ticket with priority ${priority}`,
      );

      const users = await this.getProjectUsers();
      const userAccountIds = users.map((u) => u.accountId);
      const workloads = await this.getUserWorkloads(userAccountIds);

      const suggestions = users.map((user) => {
        const workload = workloads[user.accountId];
        let score = 0;
        const reasoning: string[] = [];

        // Base score for active users
        if (user.active) {
          score += 10;
          reasoning.push('Active user');
        }

        // Role-based scoring
        const userRoles = (user.roles || []).map((r) => r.toLowerCase());
        if (ticketType === 'Bug') {
          if (
            userRoles.some(
              (r) => r.includes('developer') || r.includes('engineer'),
            )
          ) {
            score += 20;
            reasoning.push('Developer/Engineer role suitable for bug fixes');
          }
        } else if (ticketType === 'Story') {
          if (
            userRoles.some((r) => r.includes('product') || r.includes('owner'))
          ) {
            score += 15;
            reasoning.push('Product role suitable for stories');
          }
          if (userRoles.some((r) => r.includes('developer'))) {
            score += 10;
            reasoning.push('Developer can implement stories');
          }
        } else if (ticketType === 'Task') {
          score += 5; // Any role can handle tasks
          reasoning.push('Can handle general tasks');
        }

        // Priority-based scoring
        if (priority === 'Highest' || priority === 'High') {
          if (
            userRoles.some((r) => r.includes('senior') || r.includes('lead'))
          ) {
            score += 15;
            reasoning.push('Senior/Lead developer for high priority tickets');
          }
        }

        // Workload consideration
        if (workload) {
          const totalWork = workload.totalTickets + workload.storyPoints / 5; // Normalize story points
          if (totalWork < 5) {
            score += 15;
            reasoning.push('Low current workload');
          } else if (totalWork < 10) {
            score += 5;
            reasoning.push('Moderate workload');
          } else {
            score -= 10;
            reasoning.push('High current workload');
          }

          if (workload.overdue > 0) {
            score -= 5;
            reasoning.push(`${workload.overdue} overdue tickets`);
          }
        }

        // Technology/skill matching (would need custom fields in real implementation)
        if (technologies.length > 0) {
          // This is a placeholder - in real implementation, you'd match against user skills
          const commonTechs = [
            'javascript',
            'typescript',
            'react',
            'node',
            'python',
            'java',
          ];
          const matchedTechs = technologies.filter((tech) =>
            commonTechs.includes(tech.toLowerCase()),
          );
          if (matchedTechs.length > 0) {
            score += matchedTechs.length * 5;
            reasoning.push(`Skills match: ${matchedTechs.join(', ')}`);
          }
        }

        return {
          user,
          score: Math.max(0, score),
          reasoning,
        };
      });

      // Sort by score and return top suggestions
      suggestions.sort((a, b) => b.score - a.score);

      this.logger.log(`Generated ${suggestions.length} assignee suggestions`);
      return {
        suggestions: suggestions.slice(0, 5), // Top 5 suggestions
      };
    } catch (error) {
      this.logger.error(
        'Error suggesting assignee:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to suggest assignee: ${error.message}`);
    }
  }

  /**
   * Get comprehensive project dashboard data
   */
  async getProjectDashboard(): Promise<ProjectDashboard> {
    const cacheKey = `project_dashboard_${this.projectKey}`;

    return this.getCachedData(
      cacheKey,
      async () => {
        try {
          this.logger.log(`Fetching project dashboard for ${this.projectKey}`);

          // Fetch project metadata
          const projectResponse = await this.httpClient.get(
            `/project/${this.projectKey}`,
          );
          const project = projectResponse.data;

          // Fetch all project tickets for statistics
          const allTicketsResponse = await this.httpClient.get('/search', {
            params: {
              jql: `project = ${this.projectKey}`,
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
          const recentTickets = await this.searchTickets(7);

          // Get users and workloads
          const users = await this.getProjectUsers();
          const userAccountIds = users.map((u) => u.accountId);
          const workloads = await this.getUserWorkloads(userAccountIds);

          // Sprint information (if enabled)
          let sprintInfo;
          if (this.configService.get<string>('ENABLE_SPRINTS') === 'true') {
            const [activeSprints, upcomingSprints, completedSprints] =
              await Promise.all([
                this.getSprints('active'),
                this.getSprints('future'),
                this.getSprints('closed'),
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
  async createTicket(ticketData: CreateTicketDto): Promise<JiraTicket> {
    try {
      this.logger.log(`Creating JIRA ticket: ${ticketData.summary}`);

      // Get issue types and priorities from project metadata
      const createData = {
        fields: {
          project: {
            key: this.projectKey,
          },
          summary: ticketData.summary,
          description: {
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
          ...(ticketData.priority && {
            priority: {
              name: ticketData.priority,
            },
          }),
          ...(ticketData.assignee && {
            assignee: {
              emailAddress: ticketData.assignee,
            },
          }),
          ...(ticketData.labels &&
            ticketData.labels.length > 0 && {
              labels: ticketData.labels,
            }),
          ...(ticketData.components &&
            ticketData.components.length > 0 && {
              components: ticketData.components.map((name) => ({ name })),
            }),
          ...(ticketData.storyPoints && {
            customfield_10016: ticketData.storyPoints, // Story Points field
          }),
          ...(ticketData.dueDate && {
            duedate: ticketData.dueDate,
          }),
        },
      };

      const response = await this.httpClient.post('/issue', createData);

      const newTicket = response.data;
      this.logger.log(`Successfully created JIRA ticket: ${newTicket.key}`);

      // If sprint is specified and sprints are enabled, add to sprint
      if (
        ticketData.sprintId &&
        this.configService.get<string>('ENABLE_SPRINTS') === 'true'
      ) {
        try {
          await this.addTicketToSprint(newTicket.key, ticketData.sprintId);
        } catch (sprintError) {
          this.logger.warn(
            `Failed to add ticket to sprint: ${sprintError.message}`,
          );
        }
      }

      // Clear cache
      this.cache.delete(`project_dashboard_${this.projectKey}`);

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
    ticketKey: string,
    updateData: UpdateTicketDto,
  ): Promise<void> {
    try {
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
        updateFields.assignee = {
          emailAddress: updateData.assignee,
        };
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
        await this.httpClient.put(`/issue/${ticketKey}`, {
          fields: updateFields,
        });
      }

      // Handle status transition
      if (updateData.status) {
        await this.transitionTicket(ticketKey, updateData.status);
      }

      // Add comment if provided
      if (updateData.comment) {
        await this.addComment(ticketKey, updateData.comment);
      }

      // Handle sprint assignment
      if (
        updateData.sprintId &&
        this.configService.get<string>('ENABLE_SPRINTS') === 'true'
      ) {
        await this.addTicketToSprint(ticketKey, updateData.sprintId);
      }

      // Clear cache
      this.cache.delete(`project_dashboard_${this.projectKey}`);

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
    ticketKey: string,
    newStatus: string,
  ): Promise<void> {
    try {
      const transitionsResponse = await this.httpClient.get(
        `/issue/${ticketKey}/transitions`,
      );
      const transitions = transitionsResponse.data.transitions;

      const targetTransition = transitions.find(
        (t: any) => t.to.name.toLowerCase() === newStatus.toLowerCase(),
      );

      if (!targetTransition) {
        throw new Error(`No transition available to status: ${newStatus}`);
      }

      await this.httpClient.post(`/issue/${ticketKey}/transitions`, {
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

  private async addComment(ticketKey: string, comment: string): Promise<void> {
    try {
      await this.httpClient.post(`/issue/${ticketKey}/comment`, {
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

  async getProjectMetadata(): Promise<any> {
    try {
      const response = await this.httpClient.get(`/project/${this.projectKey}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching project metadata:', error.message);
      throw new Error(`Failed to fetch project metadata: ${error.message}`);
    }
  }

  async getSprints(
    state?: 'future' | 'active' | 'closed',
  ): Promise<JiraSprint[]> {
    try {
      // This assumes you're using Jira Software (not Core) and have access to the agile/board API
      // You might need to adjust this based on your Jira setup

      // First, get the board ID for the project
      const boardsResponse = await this.httpClient.get(
        `/board?projectKeyOrId=${this.projectKey}`,
        {
          baseURL: `${this.baseUrl}/rest/agile/1.0`,
        },
      );

      if (
        !boardsResponse.data.values ||
        boardsResponse.data.values.length === 0
      ) {
        this.logger.warn(`No boards found for project ${this.projectKey}`);
        return [];
      }

      const boardId = boardsResponse.data.values[0].id;

      let url = `/board/${boardId}/sprint`;
      if (state) {
        url += `?state=${state}`;
      }

      const sprintsResponse = await this.httpClient.get(url, {
        baseURL: `${this.baseUrl}/rest/agile/1.0`,
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
        `Found ${sprints.length} sprints for project ${this.projectKey}`,
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

  async getActiveSprint(): Promise<JiraSprint | null> {
    try {
      const activeSprints = await this.getSprints('active');
      return activeSprints.length > 0 ? activeSprints[0] : null;
    } catch (error) {
      this.logger.error('Error fetching active sprint:', error.message);
      return null;
    }
  }

  private async addTicketToSprint(
    ticketKey: string,
    sprintId: number,
  ): Promise<void> {
    try {
      await this.httpClient.post(
        `/sprint/${sprintId}/issue`,
        {
          issues: [ticketKey],
        },
        {
          baseURL: `${this.baseUrl}/rest/agile/1.0`,
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
}
