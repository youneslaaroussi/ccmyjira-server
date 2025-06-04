import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { JiraService, JiraConfiguration } from '../jira/jira.service';
import { JiraConfigService } from '../jira/jira-config.service';
const mdToAdf = require('md-to-adf');

export interface EmailProcessingInput {
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  receivedAt: string;
  messageId: string;
  headers: any[];
  attachments: any[];
  userId?: string;
  organizationId?: string;
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
    private readonly jiraConfigService: JiraConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Convert markdown text to Atlassian Document Format (ADF)
   * This ensures JIRA descriptions are properly formatted instead of showing raw markdown
   */
  private convertMarkdownToAdf(markdownText: string): any {
    try {
      // Convert markdown to ADF using the md-to-adf library
      const adfDocument = mdToAdf(markdownText);
      return adfDocument;
    } catch (error) {
      this.logger.warn(`Failed to convert markdown to ADF: ${error.message}. Falling back to plain text.`);
      // Fallback to plain text ADF structure if conversion fails
      return {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: markdownText.replace(/[#*_`~]/g, ''), // Strip markdown characters
              },
            ],
          },
        ],
      };
    }
  }

  async processEmail(
    input: EmailProcessingInput,
  ): Promise<EmailProcessingResult> {
    const startTime = Date.now();
    const trace = {
      startTime,
      emailAnalysis: {} as any,
      attachmentProcessing: {} as any,
      toolCalls: [] as any[],
      decisions: [] as string[],
      jiraOperations: [] as any[],
      finalResult: {} as any,
    };

    try {
      this.logger.log(`Processing email with AI: ${input.subject}`);

      // Analyze email for tracing
      trace.emailAnalysis = {
        from: input.from,
        domain: this.extractDomain(input.from),
        subject: input.subject,
        type: this.classifyEmailType(input.subject, input.textBody),
        priority: this.detectPriorityKeywords(input.subject, input.textBody),
        technologies: this.extractTechnologies(`${input.subject} ${input.textBody}`),
        mentionedUsers: this.extractMentionedUsers(`${input.subject} ${input.textBody}`),
        attachmentCount: input.attachments.length,
      };

      // Process attachments for tracing
      if (input.attachments.length > 0) {
        const attachmentData = this.processEmailAttachments(input.attachments, input.htmlBody);
        trace.attachmentProcessing = {
          total: input.attachments.length,
          processed: attachmentData.processedAttachments.length,
          types: attachmentData.processedAttachments.map(att => ({
            name: att.name,
            type: att.contentType,
            isEmbedded: !!att.contentId,
          })),
          embeddedImages: attachmentData.processedAttachments.filter(att => att.contentId).length,
          regularFiles: attachmentData.processedAttachments.filter(att => !att.contentId).length,
        };
      }

      let jiraConfig: JiraConfiguration | null = null;
      if (input.userId && input.organizationId) {
        try {
          jiraConfig = await this.jiraConfigService.getJiraConfig(input.userId, input.organizationId);
          this.logger.log(`JIRA configuration resolved for organization: ${input.organizationId}`);
          trace.decisions.push(`✅ JIRA integration available for organization: ${input.organizationId}`);
        } catch (error) {
          this.logger.warn(`Could not resolve JIRA configuration: ${error.message}`);
          trace.decisions.push(`❌ JIRA integration unavailable: ${error.message}`);
        }
      } else {
        this.logger.warn('No user/organization context provided - JIRA operations will be disabled');
        trace.decisions.push('⚠️ No user/organization context - JIRA operations disabled');
      }

      const systemPrompt = this.buildSystemPrompt(jiraConfig);
      const userPrompt = this.buildUserPrompt(input);

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

      const maxRounds = this.configService.get<number>('MAX_ROUNDS') || 10;
      let round = 0;

      while (round < maxRounds) {
        round++;
        this.logger.log(`AI conversation round ${round}`);

        const response = await this.openai.chat.completions.create({
          model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o',
          messages: messages,
          tools: this.getToolDefinitions(!!jiraConfig),
          tool_choice: 'auto',
          max_tokens: parseInt(
            this.configService.get<string>('OPENAI_MAX_TOKENS') || '4000',
          ),
        });

        const message = response.choices[0].message;

        messages.push(message);

        if (message.content) {
          result.summary = message.content;
          trace.decisions.push(`💭 AI Analysis (Round ${round}): ${message.content.substring(0, 100)}...`);
        }

        if (!message.tool_calls || message.tool_calls.length === 0) {
          this.logger.log(`AI conversation completed after ${round} rounds`);
          trace.decisions.push(`🏁 AI conversation completed after ${round} rounds`);
          break;
        }

        // Log what tools will be executed this round
        const toolNames = message.tool_calls.map(tc => tc.function.name);
        this.logger.log(`🔄 Round ${round}: Executing ${message.tool_calls.length} tools: ${toolNames.map(name => this.getToolIcon(name) + ' ' + name).join(', ')}`);

        // Track tool calls for trace
        const toolCallsInRound = message.tool_calls.map(tc => ({
          round,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }));
        trace.toolCalls.push(...toolCallsInRound);

        const toolResults = await this.executeToolCallsWithResults(
          message.tool_calls,
          input,
          jiraConfig,
        );

        // Track JIRA operations
        for (const toolCall of toolCallsInRound) {
          if (toolCall.name === 'create_jira_ticket') {
            trace.jiraOperations.push({
              type: 'CREATE',
              summary: toolCall.arguments.summary,
              issueType: toolCall.arguments.issueType,
              priority: toolCall.arguments.priority,
              assignee: toolCall.arguments.assignee,
            });
          } else if (toolCall.name === 'modify_jira_ticket') {
            trace.jiraOperations.push({
              type: 'UPDATE',
              ticketKey: toolCall.arguments.ticketKey,
              changes: Object.keys(toolCall.arguments).filter(k => k !== 'ticketKey'),
            });
          }
        }

        result.actions.push(...toolResults.actions);
        result.jiraTicketsCreated?.push(
          ...(toolResults.jiraTicketsCreated || []),
        );
        result.jiraTicketsModified?.push(
          ...(toolResults.jiraTicketsModified || []),
        );

        for (let i = 0; i < message.tool_calls.length; i++) {
          const toolCall = message.tool_calls[i];
          const toolResult = toolResults.toolCallResults[i];

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        if (toolResults.actions.length === 0) {
          break;
        }
      }

      if (round >= maxRounds) {
        this.logger.warn(
          `AI conversation reached maximum rounds (${maxRounds})`,
        );
        trace.decisions.push(`⚠️ AI conversation reached maximum rounds (${maxRounds})`);
      }

      // Finalize trace
      trace.finalResult = {
        endTime: Date.now(),
        processingTime: Date.now() - startTime,
        rounds: round,
        summary: result.summary,
        ticketsCreated: result.jiraTicketsCreated?.length || 0,
        ticketsModified: result.jiraTicketsModified?.length || 0,
        totalActions: result.actions.length,
      };

      // Log the comprehensive trace
      this.logActionTrace(trace, result);

      return result;
    } catch (error) {
      this.logger.error('Error processing email with AI:', error);
      trace.finalResult = {
        endTime: Date.now(),
        processingTime: Date.now() - startTime,
        error: error.message,
      };
      this.logActionTrace(trace, { summary: 'Error processing email', actions: [], error: error.message });
      return {
        summary: 'Error processing email',
        actions: [],
        error: error.message,
      };
    }
  }

  /**
   * Log a comprehensive, readable trace of all AI agent actions
   */
  private logActionTrace(trace: any, result: EmailProcessingResult): void {
    const duration = trace.finalResult.processingTime;
    const durationStr = duration > 1000 ? `${(duration/1000).toFixed(1)}s` : `${duration}ms`;

    const lines = [
      '',
      '🤖 ═══════════════════════════════════════════════════════════════════════════════',
      '   🧠 AI AGENT PROCESSING TRACE',
      '   ═══════════════════════════════════════════════════════════════════════════════',
      '',
      `📧 EMAIL ANALYSIS:`,
      `   From: ${trace.emailAnalysis.from} (${trace.emailAnalysis.domain})`,
      `   Subject: "${trace.emailAnalysis.subject}"`,
      `   Type: ${trace.emailAnalysis.type.toUpperCase()} | Priority: ${trace.emailAnalysis.priority.join(', ') || 'None'}`,
      `   Technologies: ${trace.emailAnalysis.technologies.join(', ') || 'None detected'}`,
      `   Mentioned Users: ${trace.emailAnalysis.mentionedUsers.join(', ') || 'None detected'}`,
      '',
    ];

    // Attachment processing
    if (trace.attachmentProcessing?.total > 0) {
      lines.push(
        `📎 ATTACHMENT PROCESSING:`,
        `   Total Files: ${trace.attachmentProcessing.total} | Processed: ${trace.attachmentProcessing.processed}`,
        `   🖼️ Embedded Images: ${trace.attachmentProcessing.embeddedImages}`,
        `   📄 Regular Files: ${trace.attachmentProcessing.regularFiles}`,
      );
      
      trace.attachmentProcessing.types.forEach((att: any, i: number) => {
        const icon = att.isEmbedded ? '🖼️' : '📄';
        lines.push(`   ${icon} ${att.name} (${att.type})`);
      });
      lines.push('');
    }

    // AI Decision Timeline
    lines.push(`🧠 AI DECISION TIMELINE:`);
    trace.decisions.forEach((decision: string, i: number) => {
      lines.push(`   ${i + 1}. ${decision}`);
    });
    lines.push('');

    // Tool Calls
    if (trace.toolCalls.length > 0) {
      lines.push(`🛠️ TOOL EXECUTION SEQUENCE:`);
      trace.toolCalls.forEach((tool: any, i: number) => {
        const icon = this.getToolIcon(tool.name);
        lines.push(`   ${i + 1}. ${icon} ${tool.name} (Round ${tool.round})`);
        
        // Show key arguments
        if (tool.name === 'create_jira_ticket') {
          lines.push(`      ➤ Summary: "${tool.arguments.summary}"`);
          lines.push(`      ➤ Type: ${tool.arguments.issueType} | Priority: ${tool.arguments.priority}`);
          if (tool.arguments.assignee) lines.push(`      ➤ Assignee: ${tool.arguments.assignee}`);
        } else if (tool.name === 'modify_jira_ticket') {
          lines.push(`      ➤ Ticket: ${tool.arguments.ticketKey}`);
          const changes = Object.keys(tool.arguments).filter(k => k !== 'ticketKey').slice(0, 3);
          lines.push(`      ➤ Changes: ${changes.join(', ')}`);
        } else if (tool.name === 'read_jira_tickets') {
          lines.push(`      ➤ Days back: ${tool.arguments.days || 7}`);
          if (tool.arguments.searchText) lines.push(`      ➤ Search: "${tool.arguments.searchText}"`);
        }
      });
      lines.push('');
    }

    // JIRA Operations Summary
    if (trace.jiraOperations.length > 0) {
      lines.push(`🎫 JIRA OPERATIONS SUMMARY:`);
      trace.jiraOperations.forEach((op: any, i: number) => {
        if (op.type === 'CREATE') {
          lines.push(`   ${i + 1}. 🆕 Created ${op.issueType}: "${op.summary}"`);
          if (op.priority) lines.push(`      Priority: ${op.priority}`);
          if (op.assignee) lines.push(`      Assigned to: ${op.assignee}`);
        } else if (op.type === 'UPDATE') {
          lines.push(`   ${i + 1}. ✏️ Updated ${op.ticketKey}`);
          lines.push(`      Changes: ${op.changes.join(', ')}`);
        }
      });
      lines.push('');
    }

    // Final Results
    lines.push(`📊 PROCESSING RESULTS:`);
    lines.push(`   ⏱️ Duration: ${durationStr} | Rounds: ${trace.finalResult.rounds || 0}`);
    lines.push(`   🎫 Tickets Created: ${trace.finalResult.ticketsCreated || 0}`);
    lines.push(`   ✏️ Tickets Modified: ${trace.finalResult.ticketsModified || 0}`);
    lines.push(`   🔧 Total Actions: ${trace.finalResult.totalActions || 0}`);
    
    if (result.error) {
      lines.push(`   ❌ Error: ${result.error}`);
    } else {
      lines.push(`   ✅ Status: Success`);
    }
    
    lines.push('');
    lines.push(`💬 AI SUMMARY:`);
    lines.push(`   "${result.summary}"`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════════════════════');

    // Log each line
    lines.forEach(line => this.logger.log(line));
  }

  /**
   * Get appropriate icon for tool type
   */
  private getToolIcon(toolName: string): string {
    const icons: { [key: string]: string } = {
      'get_current_period': '⏰',
      'read_jira_tickets': '🔍',
      'create_jira_ticket': '🆕',
      'modify_jira_ticket': '✏️',
      'get_project_users': '👥',
      'get_user_workload': '📊',
      'suggest_assignee': '🎯',
      'get_sprints': '🏃',
      'get_active_sprint': '🏃‍♂️',
    };
    return icons[toolName] || '🔧';
  }

  private buildSystemPrompt(jiraConfig: JiraConfiguration | null): string {
    const sprintsEnabled =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    const smartAssignment =
      this.configService.get<string>('ENABLE_SMART_ASSIGNMENT') === 'true';

    const jiraAvailable = !!jiraConfig;
    const projectKey = jiraConfig?.projectKey || 'N/A';

    return `You are an AI assistant that processes emails and manages JIRA tickets intelligently${sprintsEnabled ? ' with sprint awareness' : ''}${smartAssignment ? ' and smart user assignment' : ''}.

## 🚨 CRITICAL RULE: NEVER HALLUCINATE OR ASSUME
- **ONLY use information explicitly stated in the email**
- **DO NOT infer, assume, or fabricate any details**
- **DO NOT add timestamps, URLs, or technical details not mentioned**
- **DO NOT make up error codes, stack traces, or technical specifics**
- **If information is missing, state "Not specified in email" rather than guessing**

${jiraAvailable ? `Your capabilities:
- Read JIRA tickets from a specific time period
- Get current date/time information  
- Create new JIRA tickets WITH ATTACHMENTS and embedded images
- Modify existing JIRA tickets and ADD ATTACHMENTS
- Process email attachments (files, images, documents) and upload them to JIRA tickets
- Handle embedded images in HTML emails and convert them to JIRA attachments${sprintsEnabled ? '\n- Get sprint information (active, future, closed)\n- Assign tickets to sprints automatically' : ''}${smartAssignment ? '\n- Fetch available team members and their workloads\n- Get intelligent assignee suggestions\n- Assign tickets to appropriate users automatically based on AI analysis' : ''}` : 'JIRA capabilities are DISABLED - no organization/user context provided. You can only provide analysis and recommendations.'}

## 📋 PROFESSIONAL JIRA TICKET FORMAT

When creating tickets, descriptions will be automatically converted from markdown to proper JIRA format (ADF). Use clear markdown formatting:

**Summary**: Clear, actionable title (max 80 characters)

**Description**: Use this professional markdown format:
\`\`\`markdown
## Problem Statement
[Describe the issue based ONLY on email content]

## Impact Assessment  
- **Reporter**: [Email sender - exactly as provided]
- **Affected Systems**: [Only what's mentioned in email]
- **User Impact**: [Only if explicitly stated]

## Details from Email
[Include relevant email content verbatim]

## Steps to Reproduce
[Only if provided in email - don't invent steps]

## Expected vs Actual Behavior
- **Expected**: [Only if mentioned in email]
- **Actual**: [What the email describes is happening]

## Technical Information
[Only include technical details explicitly mentioned in email]

## Attachments Referenced
[List attachments by name - they will be auto-uploaded]

## Email Context
- **From**: [sender email]
- **Subject**: [email subject]
- **Received**: [timestamp]
\`\`\`

## 🎯 TICKET CLASSIFICATION RULES

**Priority Assignment** (based ONLY on email content):
- **Highest**: Site down, critical system failure, security breach
- **High**: Significant functionality broken, multiple users affected
- **Medium**: Single feature issues, moderate impact
- **Low**: Minor issues, cosmetic problems, feature requests

**Issue Types**:
- **Bug**: Something is broken or not working as expected
- **Task**: Work to be done, configuration, investigation
- **Story**: New feature or enhancement request
- **Incident**: Production issues, outages, critical problems

**Component Selection** (only if clearly identifiable):
- Frontend/UI, Backend/API, Database, Infrastructure, Authentication, etc.

## 🎯 SMART ASSIGNMENT WORKFLOW

${smartAssignment ? `When emails mention specific people or need assignment:

1. **ALWAYS GET USERS FIRST**: Use get_project_users to fetch ALL available team members
2. **ANALYZE EMAIL FOR NAMES**: Look for any names mentioned in the email (like "younes", "tell john to fix", "assign to sarah", etc.)
3. **MATCH NAMES INTELLIGENTLY**: 
   - Match partial names (e.g., "younes" could match "Younes Idrissi" or "younes.smith@company.com")
   - Look in displayName, emailAddress, and username fields
   - Use case-insensitive matching
   - Consider common variations (e.g., "john" matches "John", "johnny", "johnathan")
4. **GET SMART SUGGESTIONS**: Use suggest_assignee to get AI-powered assignment recommendations
5. **MAKE ASSIGNMENT DECISION**: Based on:
   - Explicit mentions in email ("tell younes to fix" → assign to younes)
   - AI suggestions from suggest_assignee tool
   - User availability and workload
   - Ticket type and complexity

**CRITICAL**: ALWAYS try to find and assign to that person. Search through the user list thoroughly!` : ''}

IMPORTANT WORKFLOW - Follow this order:

${jiraAvailable ? `1. **FIRST ALWAYS SEARCH**: Before creating any new tickets, ALWAYS use read_jira_tickets to search for existing related tickets (search recent tickets from last 14-30 days)

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
    ? `${sprintsEnabled ? '5.' : '4.'} **INTELLIGENT ASSIGNMENT PROCESS**:
   - **GET ALL USERS**: Always use get_project_users first to see who's available
   - **SEARCH FOR MENTIONED NAMES**: If email mentions names, search through users list carefully:
     * Check displayName field for matches
     * Check emailAddress for name patterns  
     * Check username field
     * Use partial matching (e.g., "younes" matches "Younes Idrissi")
     * Be case-insensitive
   - **GET AI SUGGESTIONS**: Use suggest_assignee with ticket context to get intelligent recommendations
   - **MAKE FINAL DECISION**: Combine explicit mentions + AI suggestions + user availability
   - **ASSIGN APPROPRIATELY**: Use the best match found`
    : ''
}

${sprintsEnabled ? '6.' : smartAssignment ? '5.' : '4.'} **ATTACHMENT HANDLING**:
   - **AUTOMATICALLY INCLUDE ATTACHMENTS**: When creating or updating tickets, ALL email attachments will be automatically uploaded to JIRA
   - **EMBEDDED IMAGES**: HTML email embedded images (cid: references) are processed and uploaded as attachments
   - **ATTACHMENT CONTEXT**: Consider attachment types when categorizing tickets:
     * Screenshots/images usually indicate bug reports or UI issues
     * Log files suggest technical/infrastructure problems  
     * Documents might be requirements or specifications
     * Code files indicate development tasks
   - **SECURITY**: Only process allowed file types (images, documents, logs, code files)
   - **SIZE LIMITS**: Attachments are limited to 10MB total per email` : ''}

## 🔍 FACTUAL ANALYSIS ONLY
- Extract information directly from email text
- Reference attachments by their actual names
- Use email sender's exact words when quoting issues
- Don't interpret or expand on technical details
- If email lacks specific information, acknowledge the gap

Remember: You have access to email attachments and embedded images. Use them to provide better context and automatically attach them to JIRA tickets for complete documentation. Always be factual and never invent details not present in the source email.

**MOST IMPORTANT**: When someone is mentioned by name in an email (like "tell younes to fix"), ALWAYS use get_project_users to find that person and assign the ticket to them if found!`;
  }

  private buildUserPrompt(input: EmailProcessingInput): string {
    // Process embedded images from HTML
    const attachmentData = this.processEmailAttachments(input.attachments, input.htmlBody);
    
    const priorityKeywords = this.detectPriorityKeywords(input.subject, input.textBody);
    const technologies = this.extractTechnologies(`${input.subject} ${input.textBody}`);
    const mentionedUsers = this.extractMentionedUsers(`${input.subject} ${input.textBody}`);
    const emailType = this.classifyEmailType(input.subject, input.textBody);

    return `Email Details:
- From: ${input.from}
- Subject: ${input.subject}
- Body: ${input.textBody}
${input.htmlBody ? `- HTML Body: ${attachmentData.processedHtml}` : ''}
- Received At: ${input.receivedAt}
- Message ID: ${input.messageId}
${input.attachments.length > 0 ? `- Attachments: ${input.attachments.length} files${attachmentData.attachmentSummary}` : ''}

Email Analysis:
- Type: ${emailType}
- Priority Keywords: ${priorityKeywords.join(', ') || 'None'}
- Technologies Mentioned: ${technologies.join(', ') || 'None'}
- Users Mentioned: ${mentionedUsers.join(', ') || 'None'}
- Domain: ${this.extractDomain(input.from)}

Please analyze this email and take appropriate actions. Pay special attention to any attachments or embedded images that might be relevant for bug reports, feature requests, or documentation.`;
  }

  /**
   * Process email attachments and embedded images
   */
  private processEmailAttachments(
    attachments: any[],
    htmlBody?: string
  ): {
    processedHtml: string;
    attachmentSummary: string;
    processedAttachments: Array<{
      name: string;
      content: string;
      contentType: string;
      contentId?: string;
    }>;
  } {
    if (!attachments || attachments.length === 0) {
      return {
        processedHtml: htmlBody || '',
        attachmentSummary: '',
        processedAttachments: [],
      };
    }

    // Convert Postmark attachments to our format
    const processedAttachments = attachments.map(att => ({
      name: att.Name || 'unnamed_file',
      content: att.Content,
      contentType: att.ContentType || 'application/octet-stream',
      contentId: att.ContentID,
    }));

    let processedHtml = htmlBody || '';
    const embeddedImages: string[] = [];
    const regularAttachments: string[] = [];

    // Process each attachment
    for (const attachment of processedAttachments) {
      if (attachment.contentId && attachment.contentType?.startsWith('image/')) {
        // This is an embedded image
        const cidPattern = new RegExp(`cid:${attachment.contentId.replace(/[<>]/g, '')}`, 'gi');
        
        if (processedHtml.match(cidPattern)) {
          embeddedImages.push(`${attachment.name} (${attachment.contentType})`);
          
          // Replace cid: references with a note about the attached image
          processedHtml = processedHtml.replace(
            cidPattern,
            `[Embedded Image: ${attachment.name}]`
          );
        }
      } else {
        // Regular attachment
        regularAttachments.push(`${attachment.name} (${attachment.contentType})`);
      }
    }

    // Create summary
    let attachmentSummary = '';
    if (regularAttachments.length > 0) {
      attachmentSummary += `\n  Regular Attachments: ${regularAttachments.join(', ')}`;
    }
    if (embeddedImages.length > 0) {
      attachmentSummary += `\n  Embedded Images: ${embeddedImages.join(', ')}`;
    }

    return {
      processedHtml,
      attachmentSummary,
      processedAttachments,
    };
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
    const namePatterns = [
      /@([a-zA-Z0-9_.-]+)/g,
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      /\b(please assign to|assign this to|can ([a-zA-Z]+) handle|([a-zA-Z]+) should look at)\b/gi
    ];

    const mentions: string[] = [];
    namePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        mentions.push(...matches);
      }
    });

    return [...new Set(mentions)];
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

  private getToolDefinitions(jiraAvailable: boolean) {
    if (!jiraAvailable) {
      return [
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
      ];
    }

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
          description: 'Create a new JIRA ticket using professional industry format. Email attachments and embedded images are automatically included. CRITICAL: Only use information explicitly stated in the email - never hallucinate or assume details.',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Clear, actionable ticket title (max 80 characters) - use exact wording from email when possible',
              },
              description: {
                type: 'string',
                description: 'MUST use the professional format provided in system prompt. Include only factual information from the email. Structure with: Problem Statement, Impact Assessment, Details from Email, Technical Information (if any), Email Context. Never invent details not in the email.',
              },
              issueType: {
                type: 'string',
                description: 'Type of issue: Bug (broken functionality), Task (work to do), Story (new feature), Incident (production issues). Choose based on email content only.',
              },
              priority: {
                type: 'string',
                description: 'Priority based ONLY on email content: Highest (site down, critical failure), High (significant broken functionality), Medium (single feature issues), Low (minor/cosmetic)',
              },
              assignee: {
                type: 'string',
                description: 'Assignee username or email address (optional) - only if explicitly mentioned in email',
              },
              labels: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of relevant labels based on email content (optional) - e.g., "production-outage", "ui-bug", "security"',
              },
              components: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of component names only if clearly identifiable from email (optional) - e.g., "Frontend", "API", "Database"',
              },
              ...(sprintsEnabled && {
                sprintId: {
                  type: 'number',
                  description: 'Sprint ID to assign ticket to (optional)',
                },
                dueDate: {
                  type: 'string',
                  description: 'Due date in YYYY-MM-DD format (optional) - only if mentioned in email',
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
          description: 'Modify an existing JIRA ticket with professional updates. New email attachments and embedded images are automatically added. CRITICAL: Only use information explicitly stated in the email - never hallucinate.',
          parameters: {
            type: 'object',
            properties: {
              ticketKey: {
                type: 'string',
                description: 'JIRA ticket key (e.g., PROJ-123)',
              },
              summary: {
                type: 'string',
                description: 'New summary only if email provides specific updated title (optional)',
              },
              status: {
                type: 'string',
                description: 'New status only if email explicitly mentions status change (e.g., "this is now fixed") (optional)',
              },
              assignee: {
                type: 'string',
                description: 'New assignee only if explicitly mentioned in email (optional)',
              },
              comment: {
                type: 'string',
                description: 'Add professional comment with email context. Use format: "Update from email [timestamp]: [relevant email content]" Include only factual information from email. (optional)',
              },
              ...(sprintsEnabled && {
                sprintId: {
                  type: 'number',
                  description: 'New sprint ID only if mentioned in email (optional)',
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
    jiraConfig: JiraConfiguration | null,
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

      const toolStartTime = Date.now();
      const icon = this.getToolIcon(name);
      this.logger.log(`🔧 Executing tool: ${icon} ${name}`);

      try {
        let toolResult: any = {};

        switch (name) {
          case 'get_current_period':
            toolResult = await this.executeGetCurrentPeriod();
            break;

          case 'read_jira_tickets':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeSearchTickets(jiraConfig, parsedArgs);
              this.logger.log(`   📋 Found ${toolResult.count} existing tickets`);
            }
            break;

          case 'create_jira_ticket':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeCreateTicket(jiraConfig, parsedArgs, emailInput);
              result.jiraTicketsCreated?.push(toolResult.ticket_key);
              this.logger.log(`   🆕 Created ticket ${toolResult.ticket_key}: "${parsedArgs.summary}"`);
              if (toolResult.attachments_uploaded > 0) {
                this.logger.log(`   📎 Uploaded ${toolResult.attachments_uploaded} attachments`);
              }
            }
            break;

          case 'modify_jira_ticket':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeModifyTicket(jiraConfig, parsedArgs, emailInput);
              result.jiraTicketsModified?.push(parsedArgs.ticketKey);
              this.logger.log(`   ✏️ Modified ticket ${parsedArgs.ticketKey}`);
              if (toolResult.attachments_uploaded > 0) {
                this.logger.log(`   📎 Added ${toolResult.attachments_uploaded} new attachments`);
              }
            }
            break;

          case 'get_project_users':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeGetProjectUsers(jiraConfig, parsedArgs);
              this.logger.log(`   👥 Retrieved ${toolResult.count} team members`);
            }
            break;

          case 'get_user_workload':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeGetUserWorkload(jiraConfig, parsedArgs);
              this.logger.log(`   📊 Analyzed workload for ${toolResult.count} users`);
            }
            break;

          case 'suggest_assignee':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeSuggestAssignee(jiraConfig, parsedArgs, emailInput);
              const topSuggestion = toolResult.suggestion?.suggestions?.[0];
              if (topSuggestion) {
                this.logger.log(`   🎯 Top assignee suggestion: ${topSuggestion.user.displayName} (score: ${topSuggestion.score})`);
              }
            }
            break;

          case 'get_sprints':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeGetSprints(jiraConfig, parsedArgs);
              this.logger.log(`   🏃 Found ${toolResult.count} sprints`);
            }
            break;

          case 'get_active_sprint':
            if (!jiraConfig) {
              toolResult = { error: 'JIRA not available - no organization context' };
            } else {
              toolResult = await this.executeGetActiveSprint(jiraConfig);
              if (toolResult.sprint) {
                this.logger.log(`   🏃‍♂️ Active sprint: ${toolResult.sprint.name}`);
              } else {
                this.logger.log(`   🚫 No active sprint found`);
              }
            }
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        const duration = Date.now() - toolStartTime;
        const durationStr = duration > 1000 ? `${(duration/1000).toFixed(1)}s` : `${duration}ms`;
        
        if (toolResult.error) {
          this.logger.warn(`   ❌ Tool ${name} failed: ${toolResult.error} (${durationStr})`);
        } else {
          this.logger.log(`   ✅ Tool ${name} completed successfully (${durationStr})`);
        }

        result.actions.push(toolResult.summary || 'No summary provided');
        result.toolCallResults.push(toolResult);
      } catch (error) {
        const duration = Date.now() - toolStartTime;
        const durationStr = duration > 1000 ? `${(duration/1000).toFixed(1)}s` : `${duration}ms`;
        
        this.logger.error(`   💥 Tool ${name} threw exception: ${error.message} (${durationStr})`);
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

  private async executeSearchTickets(jiraConfig: JiraConfiguration, args: any): Promise<any> {
    const tickets = await this.jiraService.searchTickets(
      jiraConfig,
      args.days || 7,
      args.status,
      args.assignee,
      args.sprintId,
      args.searchText,
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
    jiraConfig: JiraConfiguration,
    args: any,
    emailInput: EmailProcessingInput,
  ): Promise<any> {
    const sprintsEnabled =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    
    // Process attachments from the email
    const attachmentData = this.processEmailAttachments(emailInput.attachments, emailInput.htmlBody);
    
    // Convert markdown description to ADF format
    const adfDescription = this.convertMarkdownToAdf(args.description);
    
    const newTicket = await this.jiraService.createTicket(jiraConfig, {
      summary: args.summary,
      description: args.description, // Keep original for fallback
      adfDescription: adfDescription, // Pass ADF version
      issueType: args.issueType,
      priority: args.priority,
      assignee: args.assignee,
      labels: args.labels,
      components: args.components,
      ...(sprintsEnabled && args.sprintId ? { sprintId: args.sprintId } : {}),
      ...(sprintsEnabled && args.dueDate ? { dueDate: args.dueDate } : {}),
      ...(attachmentData.processedAttachments.length > 0 ? { 
        attachments: attachmentData.processedAttachments 
      } : {}),
    });
    
    return {
      ticket_key: newTicket.key,
      ticket_id: newTicket.id,
      summary: `Created JIRA ticket: ${newTicket.key}${attachmentData.processedAttachments.length > 0 ? ` with ${attachmentData.processedAttachments.length} attachments` : ''}`,
      status: newTicket.status,
      success: true,
      attachments_uploaded: attachmentData.processedAttachments.length,
    };
  }

  private async executeModifyTicket(
    jiraConfig: JiraConfiguration,
    args: any,
    emailInput: EmailProcessingInput,
  ): Promise<any> {
    const sprintsEnabledForModify =
      this.configService.get<string>('ENABLE_SPRINTS') === 'true';
    
    // Process attachments from the email
    const attachmentData = this.processEmailAttachments(emailInput.attachments, emailInput.htmlBody);
    
    await this.jiraService.updateTicket(jiraConfig, args.ticketKey, {
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
      ...(attachmentData.processedAttachments.length > 0 && { 
        attachments: attachmentData.processedAttachments 
      }),
    });
    
    return {
      ticket_key: args.ticketKey,
      updated_fields: Object.keys(args).filter(
        (key) => key !== 'ticketKey' && args[key],
      ),
      success: true,
      summary: `Modified JIRA ticket: ${args.ticketKey}${attachmentData.processedAttachments.length > 0 ? ` with ${attachmentData.processedAttachments.length} new attachments` : ''}`,
      attachments_uploaded: attachmentData.processedAttachments.length,
    };
  }

  private async executeGetProjectUsers(jiraConfig: JiraConfiguration, args: any): Promise<any> {
    const users = await this.jiraService.getProjectUsers(
      jiraConfig,
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

  private async executeGetUserWorkload(jiraConfig: JiraConfiguration, args: any): Promise<any> {
    const workloads = await this.jiraService.getUserWorkloads(
      jiraConfig,
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

  private async executeSuggestAssignee(jiraConfig: JiraConfiguration, args: any, emailInput: EmailProcessingInput): Promise<any> {
    const suggestionData = await this.jiraService.suggestAssignee(
      jiraConfig,
      args.ticketType, 
      args.technologies || [], 
      args.priority || 'Medium', 
      args.component
    );
    
    // Also analyze the email for mentioned names to help AI make better decisions
    const mentionedNames = this.extractMentionedUsers(`${emailInput.subject} ${emailInput.textBody}`);
    
    return {
      availableUsers: suggestionData.users.map(user => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        username: user.username,
        active: user.active,
        roles: user.roles || [],
        workload: suggestionData.workloads[user.accountId] || {
          totalTickets: 0,
          inProgressTickets: 0,
          todoTickets: 0,
          storyPoints: 0,
          overdue: 0
        }
      })),
      context: suggestionData.context,
      emailContext: {
        mentionedNames: mentionedNames,
        from: emailInput.from,
        subject: emailInput.subject,
        bodySnippet: emailInput.textBody.substring(0, 200)
      },
      summary: `Retrieved ${suggestionData.users.length} available users with workload data for intelligent assignment decision`,
    };
  }

  private async executeGetSprints(jiraConfig: JiraConfiguration, args: any): Promise<any> {
    const sprints = await this.jiraService.getSprints(jiraConfig, args.state);
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

  private async executeGetActiveSprint(jiraConfig: JiraConfiguration): Promise<any> {
    const activeSprint = await this.jiraService.getActiveSprint(jiraConfig);
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
 