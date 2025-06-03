import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { JiraService } from '../jira/jira.service';

export interface EmailProcessingInput {
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  receivedAt: string;
  messageId: string;
  headers: any[];
  attachments: any[];
}

export interface EmailProcessingResult {
  summary: string;
  actions: string[];
  jiraTicketsCreated?: string[];
  jiraTicketsModified?: string[];
  error?: string;
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly jiraService: JiraService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async processEmail(
    input: EmailProcessingInput,
  ): Promise<EmailProcessingResult> {
    try {
      this.logger.log(`Processing email with AI: ${input.subject}`);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(input);

      // Initialize conversation history
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const result: EmailProcessingResult = {
        summary: 'Email processed',
        actions: [],
        jiraTicketsCreated: [],
        jiraTicketsModified: [],
      };

      // Allow up to 5 rounds of conversation with the AI
      const maxRounds = this.configService.get<number>('MAX_ROUNDS') || 10;
      let round = 0;

      while (round < maxRounds) {
        round++;
        this.logger.log(`AI conversation round ${round}`);

        const response = await this.openai.chat.completions.create({
          model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o',
          messages: messages,
          tools: this.getToolDefinitions(),
          tool_choice: 'auto',
          max_tokens: parseInt(
            this.configService.get<string>('OPENAI_MAX_TOKENS') || '4000',
          ),
        });

        const message = response.choices[0].message;

        // Add AI response to conversation
        messages.push(message);

        // If AI provided a text response, update summary
        if (message.content) {
          result.summary = message.content;
        }

        // If no tool calls, we're done
        if (!message.tool_calls || message.tool_calls.length === 0) {
          this.logger.log(`AI conversation completed after ${round} rounds`);
          break;
        }

        // Execute tool calls and get results
        const toolResults = await this.executeToolCallsWithResults(
          message.tool_calls,
          input,
        );

        // Merge results
        result.actions.push(...toolResults.actions);
        result.jiraTicketsCreated?.push(
          ...(toolResults.jiraTicketsCreated || []),
        );
        result.jiraTicketsModified?.push(
          ...(toolResults.jiraTicketsModified || []),
        );

        // Add tool call results back to conversation so AI can see them
        for (let i = 0; i < message.tool_calls.length; i++) {
          const toolCall = message.tool_calls[i];
          const toolResult = toolResults.toolCallResults[i];

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // If this round had no meaningful results, break to avoid infinite loops
        if (toolResults.actions.length === 0) {
          break;
        }
      }

      if (round >= maxRounds) {
        this.logger.warn(
          `AI conversation reached maximum rounds (${maxRounds})`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error('Error processing email with AI:', error);
      return {
        summary: 'Error processing email',
        actions: [],
        error: error.message,
      };
    }
  }

  private buildSystemPrompt(): string {
    const sprintsEnabled =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    const smartAssignment =
      this.configService.get<string>('ENABLE_SMART_ASSIGNMENT') === 'true';

    return `You are an AI assistant that processes emails and manages JIRA tickets intelligently${sprintsEnabled ? ' with sprint awareness' : ''}${smartAssignment ? ' and smart user assignment' : ''}.

Your capabilities:
- Read JIRA tickets from a specific time period
- Get current date/time information  
- Create new JIRA tickets
- Modify existing JIRA tickets${sprintsEnabled ? '\n- Get sprint information (active, future, closed)\n- Assign tickets to sprints automatically' : ''}${smartAssignment ? '\n- Fetch available team members and their workloads\n- Suggest optimal assignees based on context and expertise\n- Assign tickets to appropriate users automatically' : ''}

IMPORTANT WORKFLOW - Follow this order:

1. **FIRST ALWAYS SEARCH**: Before creating any new tickets, ALWAYS use read_jira_tickets to search for existing related tickets (search recent tickets from last 14-30 days)

${sprintsEnabled ? '2. **CHECK CURRENT SPRINT**: Use get_active_sprint to understand the current development cycle and sprint dates\n\n3.' : '2.'} **ANALYZE EXISTING TICKETS**: Look for tickets with similar subjects, keywords, or topics. Pay attention to:
   - Similar bug reports
   - Related feature requests  
   - Login/authentication issues
   - Component or system names mentioned in the email${sprintsEnabled ? '\n   - Sprint assignments of existing tickets' : ''}

${sprintsEnabled ? '4.' : '3.'} **DECIDE ACTION BASED ON FINDINGS**:
   - If email reports a bug is FIXED and you find existing open bug tickets → update existing ticket status to "Done" or add resolution comment
   - If email is duplicate of existing ticket → add comment to existing ticket instead of creating new one
   - If email is related to existing ticket → update or comment on existing ticket
   - ONLY create new tickets if no related existing tickets are found

${
  smartAssignment
    ? `${sprintsEnabled ? '5.' : '4.'} **SMART ASSIGNMENT LOGIC**:
   - **ALWAYS GET USERS FIRST**: Use get_project_users to fetch available team members
   - **CHECK WORKLOADS**: Use get_user_workload to understand current team capacity  
   - **ANALYZE EMAIL CONTEXT**: Look for mentions of specific people, technologies, or expertise areas
   - **For Bug Reports**: Assign to developers with relevant expertise and lower workload
   - **For Feature Requests**: Assign to product owners or senior developers based on capacity
   - **For Support Issues**: Assign to support team members or generalists
   - **For Infrastructure**: Assign to DevOps/Infrastructure team members
   - **Email Context Clues**: If email mentions specific team members by name, strongly consider assigning to them
   - **Technology Matching**: Match mentioned technologies (React, Node.js, Python, etc.) with developer expertise
   - **Workload Balance**: Prefer users with lower current ticket counts and fewer story points`
    : ''
}

${
  sprintsEnabled
    ? `${smartAssignment ? '6.' : '5.'} **SPRINT-AWARE TICKET MANAGEMENT**:
   - **For NEW tickets**: Automatically assign to active sprint if appropriate
   - **Set due dates**: Use active sprint end date as default due date for new tickets
   - **Urgent tickets**: If marked as "Highest" priority, ensure they're in the active sprint
   - **Future work**: Assign to future sprints if not urgent or if active sprint is full

${smartAssignment ? '7.' : '6.'}`
    : `${smartAssignment ? '5.' : '4.'}`
} **ALWAYS EXPLAIN YOUR REASONING**: Clearly state:
   - What existing tickets you found (if any)${sprintsEnabled ? '\n   - What sprint information you discovered' : ''}${smartAssignment ? '\n   - Why you chose specific assignees (workload, expertise, email mentions)\n   - User assignment rationale and alternatives considered' : ''}
   - Why you chose to update vs create new tickets${sprintsEnabled ? '\n   - Sprint assignment decisions and due date logic' : ''}

Current time: ${new Date().toISOString()}
JIRA Project: ${this.configService.get<string>('JIRA_PROJECT_KEY')}${sprintsEnabled ? '\nSprint Management: ENABLED' : '\nSprint Management: DISABLED'}${smartAssignment ? '\nSmart Assignment: ENABLED' : '\nSmart Assignment: DISABLED'}

Remember: Search first${sprintsEnabled ? ', check sprints,' : ''}${smartAssignment ? ' get users and workloads,' : ''} then decide whether to update existing tickets or create new${sprintsEnabled ? ' sprint-assigned' : ''}${smartAssignment ? ' properly-assigned' : ''} ones!`;
  }

  private buildUserPrompt(input: EmailProcessingInput): string {
    return `Process this email and determine what JIRA actions are needed:

From: ${input.from}
Subject: ${input.subject}
Received: ${input.receivedAt}
Message ID: ${input.messageId}

Email Content:
${input.textBody || input.htmlBody}

${input.attachments.length > 0 ? `Attachments: ${input.attachments.length} files` : ''}

Additional Context Analysis:
- Email sender domain: ${this.extractDomain(input.from)}
- Priority indicators: ${this.detectPriorityKeywords(input.subject, input.textBody || input.htmlBody)}
- Technologies mentioned: ${this.extractTechnologies(input.textBody || input.htmlBody)}
- Potential assignees mentioned: ${this.extractMentionedUsers(input.textBody || input.htmlBody)}
- Email classification: ${this.classifyEmailType(input.subject, input.textBody || input.htmlBody)}

Please analyze this email and take appropriate JIRA actions.`;
  }

  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1] : 'unknown';
  }

  private detectPriorityKeywords(subject: string, body: string): string[] {
    const text = `${subject} ${body}`.toLowerCase();
    const priorityKeywords = {
      highest: ['urgent', 'critical', 'emergency', 'down', 'broken', 'asap'],
      high: ['important', 'blocking', 'priority', 'needed soon'],
      low: ['minor', 'nice to have', 'low priority', 'when possible'],
    };

    const detected: string[] = [];
    Object.entries(priorityKeywords).forEach(([level, keywords]) => {
      keywords.forEach((keyword) => {
        if (text.includes(keyword)) {
          detected.push(`${level}: ${keyword}`);
        }
      });
    });

    return detected;
  }

  private extractTechnologies(text: string): string[] {
    const technologies = [
      'javascript', 'typescript', 'react', 'angular', 'vue',
      'node.js', 'express', 'nestjs', 'python', 'django', 'flask',
      'java', 'spring', 'kotlin', 'c#', '.net', 'php', 'laravel',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp',
      'mysql', 'postgresql', 'mongodb', 'redis',
      'git', 'jenkins', 'ci/cd', 'devops'
    ];

    const lowerText = text.toLowerCase();
    return technologies.filter(tech => lowerText.includes(tech));
  }

  private extractMentionedUsers(text: string): string[] {
    // Look for common name patterns and @mentions
    const namePatterns = [
      /@([a-zA-Z0-9_.-]+)/g, // @username mentions
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // First Last names
      /\b(please assign to|assign this to|can ([a-zA-Z]+) handle|([a-zA-Z]+) should look at)\b/gi
    ];

    const mentions: string[] = [];
    namePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        mentions.push(...matches);
      }
    });

    return [...new Set(mentions)]; // Remove duplicates
  }

  private classifyEmailType(subject: string, body: string): string {
    const text = `${subject} ${body}`.toLowerCase();
    
    const patterns = {
      bug: ['bug', 'error', 'issue', 'problem', 'broken', 'fail', 'crash', 'not working'],
      feature: ['feature', 'enhancement', 'request', 'improve', 'add', 'new', 'implement'],
      support: ['help', 'support', 'question', 'how to', 'guidance', 'assistance'],
      infrastructure: ['server', 'deploy', 'database', 'performance', 'security', 'infrastructure'],
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type;
      }
    }

    return 'general';
  }

  private getToolDefinitions() {
    const sprintsEnabled =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    const smartAssignment =
      this.configService.get<string>('ENABLE_SMART_ASSIGNMENT') === 'true';

    const baseTools = [
      {
        type: 'function' as const,
        function: {
          name: 'get_current_period',
          description: 'Get current date and time information',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'read_jira_tickets',
          description: 'Read JIRA tickets from a specific time period',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to look back (default: 7)',
              },
              status: {
                type: 'string',
                description: 'Filter by ticket status (optional)',
              },
              assignee: {
                type: 'string',
                description: 'Filter by assignee (optional)',
              },
              searchText: {
                type: 'string',
                description: 'Search text in summary/description (optional)',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'create_jira_ticket',
          description: 'Create a new JIRA ticket',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Ticket summary/title',
              },
              description: {
                type: 'string',
                description: 'Detailed description of the ticket',
              },
              issueType: {
                type: 'string',
                description: 'Type of issue: Bug, Story, Task, Epic, Subtask',
              },
              priority: {
                type: 'string',
                description:
                  'Priority level: Highest, High, Medium, Low, Lowest (optional)',
              },
              assignee: {
                type: 'string',
                description: 'Assignee username or email (optional)',
              },
              labels: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of labels to add (optional)',
              },
              components: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of component names (optional)',
              },
              ...(sprintsEnabled && {
                sprintId: {
                  type: 'number',
                  description: 'Sprint ID to assign ticket to (optional)',
                },
                dueDate: {
                  type: 'string',
                  description: 'Due date in YYYY-MM-DD format (optional)',
                },
              }),
            },
            required: ['summary', 'description', 'issueType'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'modify_jira_ticket',
          description: 'Modify an existing JIRA ticket',
          parameters: {
            type: 'object',
            properties: {
              ticketKey: {
                type: 'string',
                description: 'JIRA ticket key (e.g., PROJ-123)',
              },
              summary: {
                type: 'string',
                description: 'New summary (optional)',
              },
              status: {
                type: 'string',
                description: 'New status (optional)',
              },
              assignee: {
                type: 'string',
                description: 'New assignee username or email (optional)',
              },
              comment: {
                type: 'string',
                description: 'Add comment to ticket (optional)',
              },
              ...(sprintsEnabled && {
                sprintId: {
                  type: 'number',
                  description: 'New sprint ID (optional)',
                },
              }),
            },
            required: ['ticketKey'],
          },
        },
      },
    ];

    const smartAssignmentTools = smartAssignment
      ? [
          {
            type: 'function' as const,
            function: {
              name: 'get_project_users',
              description:
                'Get all users who have access to the JIRA project with their roles and information',
              parameters: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    description:
                      'Filter by role (optional, e.g., "developer", "admin")',
                  },
                  activeOnly: {
                    type: 'boolean',
                    description: 'Only return active users (default: true)',
                  },
                },
                required: [],
              },
            },
          },
          {
            type: 'function' as const,
            function: {
              name: 'get_user_workload',
              description:
                'Get current workload information for specific users',
              parameters: {
                type: 'object',
                properties: {
                  userAccountIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Array of user account IDs to check workload for',
                  },
                  includeInProgress: {
                    type: 'boolean',
                    description:
                      'Include in-progress tickets in workload calculation (default: true)',
                  },
                },
                required: ['userAccountIds'],
              },
            },
          },
          {
            type: 'function' as const,
            function: {
              name: 'suggest_assignee',
              description:
                'Get AI suggestion for the best assignee based on ticket context and team workload',
              parameters: {
                type: 'object',
                properties: {
                  ticketType: {
                    type: 'string',
                    description: 'Type of ticket (Bug, Story, Task, etc.)',
                  },
                  technologies: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Array of technologies mentioned in the ticket',
                  },
                  priority: {
                    type: 'string',
                    description: 'Ticket priority level',
                  },
                  component: {
                    type: 'string',
                    description: 'Component or area affected (optional)',
                  },
                },
                required: ['ticketType'],
              },
            },
          },
        ]
      : [];

    const sprintTools = sprintsEnabled
      ? [
          {
            type: 'function' as const,
            function: {
              name: 'get_sprints',
              description: 'Get sprint information for the project',
              parameters: {
                type: 'object',
                properties: {
                  state: {
                    type: 'string',
                    description:
                      'Filter by sprint state: future, active, closed (optional)',
                  },
                },
                required: [],
              },
            },
          },
          {
            type: 'function' as const,
            function: {
              name: 'get_active_sprint',
              description: 'Get the currently active sprint with its details',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          },
        ]
      : [];

    return [...baseTools, ...smartAssignmentTools, ...sprintTools];
  }

  private async executeToolCallsWithResults(
    toolCalls: any[],
    emailInput: EmailProcessingInput,
  ): Promise<{
    actions: string[];
    jiraTicketsCreated?: string[];
    jiraTicketsModified?: string[];
    toolCallResults: any[];
  }> {
    const result: {
      actions: string[];
      jiraTicketsCreated?: string[];
      jiraTicketsModified?: string[];
      toolCallResults: any[];
    } = {
      actions: [],
      jiraTicketsCreated: [],
      jiraTicketsModified: [],
      toolCallResults: [],
    };

    for (const toolCall of toolCalls) {
      const { name, arguments: args } = toolCall.function;
      const parsedArgs = JSON.parse(args);

      try {
        let toolResult: any = {};

        switch (name) {
          case 'get_current_period':
            toolResult = await this.executeGetCurrentPeriod();
            break;

          case 'read_jira_tickets':
            toolResult = await this.executeSearchTickets(parsedArgs);
            break;

          case 'create_jira_ticket':
            toolResult = await this.executeCreateTicket(parsedArgs, emailInput);
            result.jiraTicketsCreated?.push(toolResult.ticket_key);
            break;

          case 'modify_jira_ticket':
            toolResult = await this.executeModifyTicket(parsedArgs, emailInput);
            result.jiraTicketsModified?.push(parsedArgs.ticketKey);
            break;

          case 'get_project_users':
            toolResult = await this.executeGetProjectUsers(parsedArgs);
            break;

          case 'get_user_workload':
            toolResult = await this.executeGetUserWorkload(parsedArgs);
            break;

          case 'suggest_assignee':
            toolResult = await this.executeSuggestAssignee(parsedArgs, emailInput);
            break;

          case 'get_sprints':
            toolResult = await this.executeGetSprints(parsedArgs);
            break;

          case 'get_active_sprint':
            toolResult = await this.executeGetActiveSprint();
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        result.actions.push(toolResult.summary || 'No summary provided');
        result.toolCallResults.push(toolResult);
      } catch (error) {
        this.logger.error(`Error executing tool call ${name}:`, error);
        result.actions.push(`Error with ${name}: ${error.message}`);
        result.toolCallResults.push({ error: error.message, tool: name });
      }
    }

    return result;
  }

  private executeGetCurrentPeriod(): Promise<any> {
    const currentTime = new Date().toISOString();
    return Promise.resolve({
      current_time: currentTime,
      summary: `Got current time: ${currentTime}`,
    });
  }

  private async executeSearchTickets(args: any): Promise<any> {
    const tickets = await this.jiraService.searchTickets(
      args.days || 7,
      args.status,
      args.assignee,
      args.sprintId,
    );
    return {
      tickets: tickets.map((ticket) => ({
        key: ticket.key,
        summary: ticket.summary,
        description: ticket.description,
        status: ticket.status,
        issueType: ticket.issueType,
        priority: ticket.priority,
        assignee: ticket.assignee,
        created: ticket.created,
        updated: ticket.updated,
      })),
      count: tickets.length,
      summary: `Found ${tickets.length} JIRA tickets`,
    };
  }

  private async executeCreateTicket(
    args: any,
    emailInput: EmailProcessingInput,
  ): Promise<any> {
    const sprintsEnabled =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    const newTicket = await this.jiraService.createTicket({
      summary: args.summary,
      description: `${args.description}\n\nCreated from email: ${emailInput.subject}\nFrom: ${emailInput.from}`,
      issueType: args.issueType,
      priority: args.priority,
      assignee: args.assignee,
      ...(sprintsEnabled && args.sprintId && { sprintId: args.sprintId }),
      ...(sprintsEnabled && args.dueDate && { dueDate: args.dueDate }),
    });
    return {
      ticket_key: newTicket.key,
      ticket_id: newTicket.id,
      summary: `Created JIRA ticket: ${newTicket.key}`,
      status: newTicket.status,
      success: true,
    };
  }

  private async executeModifyTicket(
    args: any,
    emailInput: EmailProcessingInput,
  ): Promise<any> {
    const sprintsEnabledForModify =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    await this.jiraService.updateTicket(args.ticketKey, {
      summary: args.summary,
      description: args.description,
      status: args.status,
      assignee: args.assignee,
      comment: args.comment
        ? `${args.comment}\n\nUpdated from email: ${emailInput.subject}\nFrom: ${emailInput.from}`
        : undefined,
      ...(sprintsEnabledForModify &&
        args.sprintId && { sprintId: args.sprintId }),
      ...(sprintsEnabledForModify && args.dueDate && { dueDate: args.dueDate }),
    });
    return {
      ticket_key: args.ticketKey,
      updated_fields: Object.keys(args).filter(
        (key) => key !== 'ticketKey' && args[key],
      ),
      success: true,
      summary: `Modified JIRA ticket: ${args.ticketKey}`,
    };
  }

  private async executeGetProjectUsers(args: any): Promise<any> {
    const users = await this.jiraService.getProjectUsers(
      args.role,
      args.activeOnly,
    );
    return {
      users: users.map((user) => ({
        accountId: user.accountId,
        username: user.username,
        emailAddress: user.emailAddress,
        displayName: user.displayName,
        roles: user.roles,
      })),
      count: users.length,
      summary: `Found ${users.length} JIRA users`,
    };
  }

  private async executeGetUserWorkload(args: any): Promise<any> {
    const workloads = await this.jiraService.getUserWorkloads(
      args.userAccountIds,
      args.includeInProgress,
    );
    return {
      workloads: Object.values(workloads).map((w) => ({
        accountId: w.accountId,
        username: w.username,
        displayName: w.displayName,
        totalTickets: w.totalTickets,
        inProgressTickets: w.inProgressTickets,
        todoTickets: w.todoTickets,
        storyPoints: w.storyPoints,
        overdue: w.overdue,
      })),
      count: Object.keys(workloads).length,
      summary: `Found workloads for ${Object.keys(workloads).length} users`,
    };
  }

  private async executeSuggestAssignee(args: any, _emailInput: EmailProcessingInput): Promise<any> {
    const suggestion = await this.jiraService.suggestAssignee(
      args.ticketType, 
      args.technologies || [], 
      args.priority || 'Medium', 
      args.component
    );
    return {
      suggestion,
      summary: `Generated assignee suggestions based on ticket context`,
    };
  }

  private async executeGetSprints(args: any): Promise<any> {
    const sprints = await this.jiraService.getSprints(args.state);
    return {
      sprints: sprints.map((sprint) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      })),
      count: sprints.length,
      summary: `Found ${sprints.length} JIRA sprints`,
    };
  }

  private async executeGetActiveSprint(): Promise<any> {
    const activeSprint = await this.jiraService.getActiveSprint();
    if (activeSprint) {
      return {
        sprint: {
          id: activeSprint.id,
          name: activeSprint.name,
          state: activeSprint.state,
          startDate: activeSprint.startDate,
          endDate: activeSprint.endDate,
        },
        success: true,
        summary: `Found active JIRA sprint: ${activeSprint.name}`,
      };
    } else {
      return {
        sprint: null,
        success: false,
        message: 'No active sprint found',
        summary: 'No active JIRA sprint found',
      };
    }
  }
}
