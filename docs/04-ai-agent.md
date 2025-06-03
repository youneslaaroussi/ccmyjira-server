# 🤖 AI Agent System

This document provides an in-depth look at the AI-powered email processing system's core intelligence layer, including GPT-4o integration, tool calling, conversation management, and decision-making logic.

## 📋 Table of Contents

- [AI Agent Overview](#ai-agent-overview)
- [System Prompt Design](#system-prompt-design)
- [Tool Calling Architecture](#tool-calling-architecture)
- [Conversation Management](#conversation-management)
- [Decision Making Logic](#decision-making-logic)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)

## 🎯 AI Agent Overview

The AI Agent is the brain of the email processing system, responsible for:

- **Email Analysis**: Understanding email content, intent, and context
- **Decision Making**: Determining appropriate JIRA actions
- **Tool Orchestration**: Executing multiple tool calls in sequence
- **Context Preservation**: Maintaining conversation state across rounds
- **Intelligent Routing**: Assigning work to appropriate team members

### Core Components

```typescript
┌─────────────────────────────────────────────────┐
│              AI Agent Service                   │
├─────────────────────────────────────────────────┤
│ • Conversation Manager                          │
│   - System prompt construction                  │
│   - Message history tracking                    │
│   - Context preservation                        │
│                                                 │
│ • Tool Executor                                 │
│   - Tool call validation                        │
│   - Parallel execution                          │
│   - Result aggregation                          │
│                                                 │
│ • Decision Engine                               │
│   - Email classification                        │
│   - Action planning                             │
│   - Priority assessment                         │
└─────────────────────────────────────────────────┘
```

## 📝 System Prompt Design

### Base System Prompt

The system prompt is dynamically constructed based on configuration:

```typescript
private buildSystemPrompt(): string {
  const sprintsEnabled = this.configService.get<string>('ENABLE_SPRINTS') === 'true';
  const smartAssignment = this.configService.get<string>('ENABLE_SMART_ASSIGNMENT') === 'true';

  return `You are an AI assistant that processes emails and manages JIRA tickets intelligently.

Your capabilities:
- Read JIRA tickets from a specific time period
- Get current date/time information  
- Create new JIRA tickets
- Modify existing JIRA tickets
${sprintsEnabled ? '- Get sprint information (active, future, closed)\n- Assign tickets to sprints automatically' : ''}
${smartAssignment ? '- Fetch available team members\n- Assign tickets to appropriate users based on context' : ''}

IMPORTANT WORKFLOW - Follow this order:

1. **FIRST ALWAYS SEARCH**: Before creating any new tickets, ALWAYS use read_jira_tickets to search for existing related tickets (search recent tickets from last 14-30 days)

2. **ANALYZE EXISTING TICKETS**: Look for tickets with similar subjects, keywords, or topics. Pay attention to:
   - Similar bug reports
   - Related feature requests  
   - Login/authentication issues
   - Component or system names mentioned in the email

3. **DECIDE ACTION BASED ON FINDINGS**:
   - If email reports a bug is FIXED and you find existing open bug tickets → update existing ticket status to "Done" or add resolution comment
   - If email is duplicate of existing ticket → add comment to existing ticket instead of creating new one
   - If email is related to existing ticket → update or comment on existing ticket
   - ONLY create new tickets if no related existing tickets are found

${smartAssignment ? `4. **SMART ASSIGNMENT LOGIC**:
   - **For Bug Reports**: Assign to developers with relevant expertise
   - **For Feature Requests**: Assign to product owners or senior developers
   - **For Support Issues**: Assign to support team members
   - **For Infrastructure**: Assign to DevOps/Infrastructure team
   - **Email Context Clues**: Look for mentions of specific team members, technologies, or components` : ''}

Current time: ${new Date().toISOString()}
JIRA Project: ${this.configService.get<string>('JIRA_PROJECT_KEY')}
${sprintsEnabled ? '\nSprint Management: ENABLED' : '\nSprint Management: DISABLED'}
${smartAssignment ? '\nSmart Assignment: ENABLED' : '\nSmart Assignment: DISABLED'}

Remember: Search first, analyze context, then decide whether to update existing tickets or create new ones!`;
}
```

### Contextual Prompt Enhancement

The agent considers email context for smarter decisions:

```typescript
private buildUserPrompt(input: EmailProcessingInput): string {
  return `Process this email and determine what JIRA actions are needed:

From: ${input.from}
Subject: ${input.subject}
Received: ${input.receivedAt}
Message ID: ${input.messageId}

Email Content:
${input.textBody || input.htmlBody}

${input.attachments.length > 0 ? `Attachments: ${input.attachments.length} files` : ''}

Additional Context:
- Email sender domain: ${this.extractDomain(input.from)}
- Email priority indicators: ${this.detectPriorityKeywords(input.subject, input.textBody)}
- Mentioned technologies: ${this.extractTechnologies(input.textBody)}
- Potential assignees mentioned: ${this.extractMentionedUsers(input.textBody)}

Please analyze this email and take appropriate JIRA actions.`;
}
```

## 🛠️ Tool Calling Architecture

### Available Tools

The agent has access to these tools:

#### **Core Tools**
```typescript
{
  name: 'get_current_period',
  description: 'Get current date and time information'
}

{
  name: 'read_jira_tickets',
  description: 'Read JIRA tickets from a specific time period',
  parameters: {
    days: 'Number of days to look back',
    status: 'Filter by ticket status',
    assignee: 'Filter by assignee',
    searchText: 'Search in summary/description'
  }
}

{
  name: 'create_jira_ticket',
  description: 'Create a new JIRA ticket',
  parameters: {
    summary: 'Ticket summary/title',
    description: 'Detailed description',
    issueType: 'Bug, Story, Task, Epic, Subtask',
    priority: 'Highest, High, Medium, Low, Lowest',
    assignee: 'Username or email to assign',
    labels: 'Array of labels to add',
    components: 'Array of component names'
  }
}

{
  name: 'modify_jira_ticket',
  description: 'Modify an existing JIRA ticket',
  parameters: {
    ticketKey: 'JIRA ticket key (e.g., PROJ-123)',
    summary: 'New summary (optional)',
    status: 'New status (optional)',
    assignee: 'New assignee (optional)',
    comment: 'Add comment (optional)'
  }
}
```

#### **Smart Assignment Tools**
```typescript
{
  name: 'get_project_users',
  description: 'Get all users who have access to the JIRA project',
  parameters: {
    role: 'Filter by role (optional)',
    active: 'Only active users (default: true)'
  }
}

{
  name: 'get_user_workload',
  description: 'Get current workload for specific users',
  parameters: {
    usernames: 'Array of usernames to check',
    includeInProgress: 'Include in-progress tickets'
  }
}

{
  name: 'suggest_assignee',
  description: 'Get AI suggestion for ticket assignment',
  parameters: {
    ticketType: 'Type of ticket (Bug, Story, etc.)',
    technologies: 'Array of technologies mentioned',
    priority: 'Ticket priority level',
    component: 'Component or area affected'
  }
}
```

### Tool Execution Flow

```typescript
private async executeToolCallsWithResults(
  toolCalls: any[],
  emailInput: EmailProcessingInput,
): Promise<ToolExecutionResult> {
  const result = {
    actions: [],
    jiraTicketsCreated: [],
    jiraTicketsModified: [],
    toolCallResults: [],
  };

  // Execute tools in sequence for dependencies
  for (const toolCall of toolCalls) {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args);

    try {
      let toolResult: any = {};

      switch (name) {
        case 'read_jira_tickets':
          toolResult = await this.executeSearchTickets(parsedArgs);
          break;
          
        case 'get_project_users':
          toolResult = await this.executeGetProjectUsers(parsedArgs);
          break;
          
        case 'suggest_assignee':
          toolResult = await this.executeSuggestAssignee(parsedArgs, emailInput);
          break;
          
        case 'create_jira_ticket':
          toolResult = await this.executeCreateTicket(parsedArgs, emailInput);
          result.jiraTicketsCreated.push(toolResult.ticket_key);
          break;
          
        // ... other tool executions
      }

      result.toolCallResults.push(toolResult);
      result.actions.push(`Executed ${name}: ${toolResult.summary || 'Success'}`);

    } catch (error) {
      this.logger.error(`Tool execution failed for ${name}:`, error);
      result.toolCallResults.push({ error: error.message, tool: name });
      result.actions.push(`Error with ${name}: ${error.message}`);
    }
  }

  return result;
}
```

## 🧠 Conversation Management

### Multi-Round Processing

The agent supports complex workflows through multiple conversation rounds:

```typescript
async processEmail(input: EmailProcessingInput): Promise<EmailProcessingResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: this.buildSystemPrompt() },
    { role: 'user', content: this.buildUserPrompt(input) },
  ];

  let result: EmailProcessingResult = {
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

    // Call GPT-4o with current conversation history
    const response = await this.openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o',
      messages: messages,
      tools: this.getToolDefinitions(),
      tool_choice: 'auto',
      max_tokens: parseInt(this.configService.get<string>('OPENAI_MAX_TOKENS') || '4000'),
    });

    const message = response.choices[0].message;
    messages.push(message);

    // Update summary if AI provided one
    if (message.content) {
      result.summary = message.content;
    }

    // Break if no tool calls (conversation complete)
    if (!message.tool_calls || message.tool_calls.length === 0) {
      this.logger.log(`AI conversation completed after ${round} rounds`);
      break;
    }

    // Execute tool calls and add results to conversation
    const toolResults = await this.executeToolCallsWithResults(message.tool_calls, input);
    
    result.actions.push(...toolResults.actions);
    result.jiraTicketsCreated?.push(...(toolResults.jiraTicketsCreated || []));
    result.jiraTicketsModified?.push(...(toolResults.jiraTicketsModified || []));

    // Add tool results back to conversation
    for (let i = 0; i < message.tool_calls.length; i++) {
      const toolCall = message.tool_calls[i];
      const toolResult = toolResults.toolCallResults[i];
      
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

    // Break if no meaningful progress
    if (toolResults.actions.length === 0) {
      break;
    }
  }

  return result;
}
```

### Context Preservation

The system maintains context across rounds by:

1. **Message History**: All messages and tool results are preserved
2. **State Tracking**: Current ticket states and user assignments
3. **Decision Memory**: Previous decisions and their rationale
4. **Error Recovery**: Learning from failed attempts

## 🎯 Decision Making Logic

### Email Classification

The agent classifies emails into categories:

```typescript
private classifyEmail(input: EmailProcessingInput): EmailClassification {
  const subject = input.subject.toLowerCase();
  const body = (input.textBody || input.htmlBody).toLowerCase();
  
  // Bug report indicators
  const bugKeywords = ['bug', 'error', 'issue', 'problem', 'broken', 'fail', 'crash'];
  const isBugReport = bugKeywords.some(keyword => 
    subject.includes(keyword) || body.includes(keyword)
  );
  
  // Feature request indicators
  const featureKeywords = ['feature', 'enhancement', 'request', 'improve', 'add', 'new'];
  const isFeatureRequest = featureKeywords.some(keyword => 
    subject.includes(keyword) || body.includes(keyword)
  );
  
  // Support request indicators
  const supportKeywords = ['help', 'support', 'question', 'how to', 'guidance'];
  const isSupportRequest = supportKeywords.some(keyword => 
    subject.includes(keyword) || body.includes(keyword)
  );
  
  return {
    type: isBugReport ? 'bug' : isFeatureRequest ? 'feature' : isSupportRequest ? 'support' : 'general',
    priority: this.determinePriority(subject, body),
    technologies: this.extractTechnologies(body),
    mentionedUsers: this.extractMentionedUsers(body),
  };
}
```

### Priority Assessment

```typescript
private determinePriority(subject: string, body: string): string {
  const text = `${subject} ${body}`.toLowerCase();
  
  if (text.includes('urgent') || text.includes('critical') || text.includes('down')) {
    return 'Highest';
  }
  if (text.includes('important') || text.includes('asap') || text.includes('blocking')) {
    return 'High';
  }
  if (text.includes('minor') || text.includes('low priority')) {
    return 'Low';
  }
  
  return 'Medium'; // Default priority
}
```

### Smart Assignment Logic

```typescript
private async suggestAssignee(
  ticketType: string,
  technologies: string[],
  priority: string,
  emailContext: EmailProcessingInput
): Promise<string | null> {
  // Get project users with their skills/roles
  const users = await this.jiraService.getProjectUsers();
  const userWorkloads = await this.jiraService.getUserWorkloads(users.map(u => u.username));
  
  // Score users based on various factors
  const userScores = users.map(user => {
    let score = 0;
    
    // Technology expertise matching
    const userSkills = user.customFields?.skills || [];
    const techMatches = technologies.filter(tech => 
      userSkills.some(skill => skill.toLowerCase().includes(tech.toLowerCase()))
    ).length;
    score += techMatches * 10;
    
    // Role-based scoring
    if (ticketType === 'Bug' && user.role?.includes('Developer')) score += 15;
    if (ticketType === 'Story' && user.role?.includes('Product')) score += 15;
    if (ticketType === 'Task' && user.role?.includes('Admin')) score += 10;
    
    // Workload consideration (fewer current tickets = higher score)
    const currentWorkload = userWorkloads[user.username] || 0;
    score += Math.max(0, 20 - currentWorkload);
    
    // Priority handling (senior developers for high priority)
    if (priority === 'Highest' && user.role?.includes('Senior')) score += 10;
    
    // Email context (mentioned in email)
    if (emailContext.textBody?.includes(user.displayName) || 
        emailContext.textBody?.includes(user.username)) {
      score += 25; // Strong indicator
    }
    
    return { user, score };
  });
  
  // Sort by score and return best match
  userScores.sort((a, b) => b.score - a.score);
  
  return userScores.length > 0 && userScores[0].score > 5 
    ? userScores[0].user.username 
    : null;
}
```

## ⚡ Performance Optimization

### Parallel Tool Execution

Where possible, tools are executed in parallel:

```typescript
private async executeParallelTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const independentTools = this.identifyIndependentTools(toolCalls);
  const dependentTools = this.identifyDependentTools(toolCalls);
  
  // Execute independent tools in parallel
  const parallelResults = await Promise.allSettled(
    independentTools.map(tool => this.executeTool(tool))
  );
  
  // Execute dependent tools sequentially
  const sequentialResults = [];
  for (const tool of dependentTools) {
    const result = await this.executeTool(tool, parallelResults);
    sequentialResults.push(result);
  }
  
  return [...parallelResults, ...sequentialResults];
}
```

### Caching Strategies

```typescript
private readonly userCache = new Map<string, { data: any; timestamp: number }>();
private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

private async getCachedProjectUsers(): Promise<JiraUser[]> {
  const cacheKey = `project_users_${this.configService.get('JIRA_PROJECT_KEY')}`;
  const cached = this.userCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data;
  }
  
  const users = await this.jiraService.getProjectUsers();
  this.userCache.set(cacheKey, { data: users, timestamp: Date.now() });
  
  return users;
}
```

## 🛡️ Error Handling

### Tool Execution Errors

```typescript
private async executeToolWithRetry(
  toolCall: ToolCall,
  maxRetries: number = 3
): Promise<ToolResult> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.executeTool(toolCall);
    } catch (error) {
      lastError = error;
      this.logger.warn(`Tool ${toolCall.name} attempt ${attempt} failed:`, error.message);
      
      // Exponential backoff
      if (attempt < maxRetries) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  throw new Error(`Tool ${toolCall.name} failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

### Conversation Recovery

```typescript
private async recoverFromError(
  error: Error,
  conversation: ChatMessage[],
  attempt: number
): Promise<ChatMessage[]> {
  if (attempt >= 3) {
    throw error;
  }
  
  // Add error context to conversation
  conversation.push({
    role: 'assistant',
    content: `I encountered an error: ${error.message}. Let me try a different approach.`
  });
  
  // Simplify the request
  const simplifiedPrompt = this.buildSimplifiedPrompt(conversation);
  conversation.push({
    role: 'user',
    content: simplifiedPrompt
  });
  
  return conversation;
}
```

## 🔗 Related Documentation

- **[JIRA Integration](06-jira-integration.md)** - JIRA API and ticket management
- **[Queue System](07-queue-system.md)** - Background job processing
- **[Configuration](03-configuration.md)** - AI agent configuration options
- **[API Reference](11-api-reference.md)** - REST endpoints and webhook formats

---

**Next**: Explore email processing workflows in [Email Processing Guide](05-email-processing.md). 