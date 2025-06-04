# 🤖 AI Agent System

This document provides an in-depth look at the AI-powered email processing system's core intelligence layer, including GPT-4o integration, tool calling, conversation management, decision-making logic, **and attachment/embedded image processing**.

## 📋 Table of Contents

- [AI Agent Overview](#ai-agent-overview)
- [System Prompt Design](#system-prompt-design)
- [Attachment Processing](#attachment-processing)
- [Tool Calling Architecture](#tool-calling-architecture)
- [Conversation Management](#conversation-management)
- [Decision Making Logic](#decision-making-logic)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)

## 🎯 AI Agent Overview

The AI Agent is the brain of the email processing system, responsible for:

- **Email Analysis**: Understanding email content, intent, and context
- **Attachment Processing**: Handling email attachments and embedded images
- **Decision Making**: Determining appropriate JIRA actions
- **Tool Orchestration**: Executing multiple tool calls in sequence
- **Context Preservation**: Maintaining conversation state across rounds
- **Intelligent Routing**: Assigning work to appropriate team members
- **File Management**: Uploading attachments to JIRA tickets automatically

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
│ • Attachment Processor                          │
│   - Email attachment parsing                    │
│   - Embedded image extraction                   │
│   - Base64 content handling                     │
│   - JIRA upload coordination                    │
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
│   - Attachment context analysis                 │
└─────────────────────────────────────────────────┘
```

## 📎 Attachment Processing

### Supported Attachment Types

The system automatically processes and uploads:

#### **Regular Attachments**
- **Documents**: PDF, DOC, DOCX, TXT
- **Images**: PNG, JPG, GIF, SVG  
- **Logs**: LOG, TXT (console logs, error logs)
- **Code Files**: JS, TS, HTML, CSS, JSON
- **Archives**: ZIP (for multiple files)
- **Data Files**: HAR (network traces), XML, CSV

#### **Embedded Images**
- **HTML Email Images**: Referenced with `cid:` in HTML
- **Inline Screenshots**: Pasted directly into email clients
- **Diagrams**: Architecture diagrams, flowcharts
- **UI Mockups**: Design files and wireframes

### Processing Workflow

```typescript
1. Email Reception (Postmark Webhook)
   ├── Regular attachments in Attachments array
   └── Embedded images with ContentID

2. AI Agent Processing
   ├── processEmailAttachments()
   │   ├── Convert Postmark format to internal format
   │   ├── Identify embedded images by ContentID
   │   ├── Process HTML cid: references
   │   └── Generate attachment summary
   │
   └── Include in JIRA operations
       ├── createTicket() with attachments
       └── updateTicket() with new attachments

3. JIRA Integration
   ├── Convert base64 to binary
   ├── Create FormData for upload
   ├── Upload via JIRA Attachments API
   └── Associate with ticket
```

### Example Processing

**Email with Mixed Attachments:**
```typescript
{
  "Attachments": [
    {
      "Name": "bug-screenshot.png",
      "Content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
      "ContentType": "image/png",
      "ContentID": "<screenshot001>"  // Embedded image
    },
    {
      "Name": "error-log.txt", 
      "Content": "VW5jYXVnaHQgUmVmZXJlbmNlRXJyb3I6...",
      "ContentType": "text/plain"     // Regular attachment
    }
  ]
}
```

**Processed Result:**
- `bug-screenshot.png` → Embedded image, replaces `<img src="cid:screenshot001" />` in HTML
- `error-log.txt` → Regular attachment
- Both uploaded to JIRA ticket automatically

## 📝 System Prompt Design

### Enhanced System Prompt with Attachment Awareness

The system prompt now includes attachment handling instructions:

```typescript
private buildSystemPrompt(): string {
  return `You are an AI assistant that processes emails and manages JIRA tickets intelligently.

Your capabilities:
- Read JIRA tickets from a specific time period
- Get current date/time information  
- Create new JIRA tickets WITH ATTACHMENTS and embedded images
- Modify existing JIRA tickets and ADD ATTACHMENTS
- Process email attachments (files, images, documents) and upload them to JIRA tickets
- Handle embedded images in HTML emails and convert them to JIRA attachments

ATTACHMENT HANDLING:
- **AUTOMATICALLY INCLUDE ATTACHMENTS**: When creating or updating tickets, ALL email attachments will be automatically uploaded to JIRA
- **EMBEDDED IMAGES**: HTML email embedded images (cid: references) are processed and uploaded as attachments
- **ATTACHMENT CONTEXT**: Consider attachment types when categorizing tickets:
  * Screenshots/images usually indicate bug reports or UI issues
  * Log files suggest technical/infrastructure problems  
  * Documents might be requirements or specifications
  * Code files indicate development tasks
- **SECURITY**: Only process allowed file types (images, documents, logs, code files)
- **SIZE LIMITS**: Attachments are limited to 10MB total per email

Remember: You have access to email attachments and embedded images. Use them to provide better context and automatically attach them to JIRA tickets for complete documentation.`;
}
```

### Contextual Prompt with Attachment Analysis

```typescript
private buildUserPrompt(input: EmailProcessingInput): string {
  // Process embedded images from HTML
  const attachmentData = this.processEmailAttachments(input.attachments, input.htmlBody);
  
  return `Email Details:
- From: ${input.from}
- Subject: ${input.subject}
- Body: ${input.textBody}
${input.htmlBody ? `- HTML Body: ${attachmentData.processedHtml}` : ''}
- Received At: ${input.receivedAt}
${input.attachments.length > 0 ? `- Attachments: ${input.attachments.length} files${attachmentData.attachmentSummary}` : ''}

Email Analysis:
- Type: ${emailType}
- Priority Keywords: ${priorityKeywords.join(', ') || 'None'}
- Technologies Mentioned: ${technologies.join(', ') || 'None'}
- Users Mentioned: ${mentionedUsers.join(', ') || 'None'}

Please analyze this email and take appropriate actions. Pay special attention to any attachments or embedded images that might be relevant for bug reports, feature requests, or documentation.`;
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
  description: 'Create a new JIRA ticket. Email attachments and embedded images are automatically included.',
  parameters: {
    summary: 'Ticket title/summary',
    description: 'Detailed description. Email context will be automatically appended.',
    issueType: 'Bug, Story, Task, Epic, etc.',
    priority: 'Highest, High, Medium, Low',
    assignee: 'Username or email to assign',
    labels: 'Array of labels to add',
    components: 'Array of component names'
  }
}

{
  name: 'modify_jira_ticket',
  description: 'Modify an existing JIRA ticket. New email attachments and embedded images are automatically added.',
  parameters: {
    ticketKey: 'JIRA ticket key (e.g., PROJ-123)',
    summary: 'New summary (optional)',
    status: 'New status (optional)',
    assignee: 'New assignee (optional)',
    comment: 'Add comment. Email context will be automatically appended. (optional)'
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