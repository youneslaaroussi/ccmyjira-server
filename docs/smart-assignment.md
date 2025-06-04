# Smart Assignment Feature Documentation

## 📋 Overview

The Smart Assignment feature enables AI-powered automatic ticket assignment based on team member expertise, current workload, ticket context, and email content analysis. When enabled, the AI agent can intelligently assign tickets to the most suitable team members instead of leaving them unassigned.

## 🔧 Requirements & Setup

### Environment Configuration

Add this to your `.env` file to enable smart assignment:

```bash
# Enable Smart Assignment Feature
ENABLE_SMART_ASSIGNMENT=true
```

### JIRA Cloud API Permissions Required

The smart assignment feature requires **additional JIRA permissions** beyond basic ticket operations:

#### **Required JIRA Permissions:**
- ✅ **Project Role Management** - Read project roles and role members
- ✅ **User Management** - Read user information and account details  
- ✅ **Issue Search** - Search and filter tickets by assignee
- ✅ **Issue Assignment** - Assign tickets to users
- ✅ **Custom Field Access** - Read story points and custom fields (for workload calculation)

#### **JIRA Cloud API Endpoints Used:**
```http
GET /rest/api/3/project/{projectKey}/role
GET /rest/api/3/project/{projectKey}/role/{roleId}
GET /rest/api/3/user?accountId={accountId}
GET /rest/api/3/search?jql={query}
PUT /rest/api/3/issue/{issueKey}
```

### JIRA Project Setup Requirements

#### **1. Project Roles Configuration**
Your JIRA project must have meaningful role assignments:

```
✅ Developers - Users who can fix bugs and implement features
✅ Product Owners/Managers - Users who define requirements
✅ QA/Testers - Users who handle testing tasks
✅ DevOps/Administrators - Users who handle infrastructure
✅ Support - Users who handle customer issues
```

#### **2. User Role Assignment**
Team members must be assigned to appropriate project roles:

- **Developers** → `Developers` role
- **Senior/Lead Developers** → Role names containing "Senior" or "Lead" 
- **Product Managers** → Role names containing "Product" or "Owner"
- **DevOps Engineers** → Role names containing "Admin" or "DevOps"
- **Support Team** → Role names containing "Support"

#### **3. Story Points Field (Optional)**
For accurate workload calculation, ensure story points are configured:
- **Field Name**: Usually `customfield_10016` (Story Points)
- **Field Type**: Number field
- **Project Configuration**: Enabled in your project scheme

## 🎯 How Smart Assignment Works

### **1. User Discovery**
```typescript
// Get all project team members
const users = await jiraService.getProjectUsers(jiraConfig);
// Returns: Array of users with roles, activity status, contact info
```

### **2. Workload Analysis** 
```typescript
// Calculate current workload for each user
const workloads = await jiraService.getUserWorkloads(jiraConfig, userIds);
// Returns: Current tickets, story points, overdue items per user
```

### **3. Context Analysis**
The AI analyzes email content for:
- **🔍 Mentioned Users**: Names, @mentions, specific assignments
- **💻 Technologies**: React, Node.js, Python, etc.
- **📁 Components**: Frontend, API, Database, Infrastructure
- **⚡ Priority Level**: Urgent, High, Medium, Low
- **🎫 Ticket Type**: Bug, Story, Task, Incident

### **4. Intelligent Scoring**
Each user gets scored based on:

```typescript
let score = 0;

// Base scoring
if (user.active) score += 10;                    // Active users preferred

// Role-based scoring
if (ticketType === 'Bug' && isDeveloper) score += 20;
if (ticketType === 'Story' && isProductOwner) score += 15;
if (priority === 'High' && isSeniorDev) score += 15;

// Workload consideration
if (currentWorkload < 5) score += 15;            // Low workload bonus
if (currentWorkload > 10) score -= 10;           // High workload penalty
if (overdueTickets > 0) score -= 5;              // Overdue penalty

// Email context matching
if (emailMentionsUser) score += 25;              // Strong preference
if (technologiesMatch) score += (matches * 5);   // Skill matching

return { user, score, reasoning };
```

### **5. Assignment Decision**
- **Top scorer** gets automatically assigned
- **Minimum score threshold** prevents poor assignments
- **Reasoning logged** for transparency

## 🛠️ API Operations

### Get Project Users
```http
GET /api/dashboard/users?organizationId={orgId}&role={role}&activeOnly=true
```

**Response:**
```json
[
  {
    "accountId": "user123",
    "username": "john.doe",
    "emailAddress": "john.doe@company.com", 
    "displayName": "John Doe",
    "active": true,
    "roles": ["Developers", "Senior Developers"],
    "avatarUrls": { "48x48": "https://avatar-url.com/john.png" }
  }
]
```

### Get User Workloads
```http
GET /api/dashboard/workloads?organizationId={orgId}&userIds=user1,user2
```

**Response:**
```json
{
  "user123": {
    "accountId": "user123",
    "username": "john.doe", 
    "displayName": "John Doe",
    "totalTickets": 12,
    "inProgressTickets": 3,
    "todoTickets": 9,
    "storyPoints": 21,
    "overdue": 1
  }
}
```

### Suggest Assignee
```http
GET /api/dashboard/suggest-assignee?type=Bug&technologies=react,typescript&priority=High
```

**Response:**
```json
{
  "suggestions": [
    {
      "user": {
        "accountId": "user123",
        "displayName": "Jane Smith",
        "emailAddress": "jane.smith@company.com"
      },
      "score": 65,
      "reasoning": [
        "Active user",
        "Developer/Engineer role suitable for bug fixes", 
        "Senior/Lead developer for high priority tickets",
        "Low current workload",
        "Skills match: react, typescript"
      ]
    }
  ]
}
```

## 🔄 AI Agent Workflow

When `ENABLE_SMART_ASSIGNMENT=true`, the AI agent follows this workflow:

### **1. Email Analysis Phase**
```typescript
// Extract context from email
const emailContext = {
  type: classifyEmailType(subject, body),           // "bug", "feature", "support"
  priority: detectPriorityKeywords(subject, body), // "urgent", "high", etc.
  technologies: extractTechnologies(body),          // ["react", "node.js"]
  mentionedUsers: extractMentionedUsers(body),      // ["john.doe"]
  domain: extractDomain(from)                       // "company.com"
};
```

### **2. Team Discovery Phase**
```typescript
// AI calls tools in sequence:
1. get_project_users() → Fetch all team members
2. get_user_workload(userIds) → Calculate current workloads
3. suggest_assignee(context) → Generate assignment recommendations
```

### **3. Decision Phase**
```typescript
// AI evaluates suggestions and decides:
if (topSuggestion.score > 20) {
  // High confidence - auto-assign
  createTicket({ assignee: topSuggestion.user.emailAddress });
} else {
  // Low confidence - leave unassigned for manual review
  createTicket({ assignee: null });
}
```

### **4. Assignment Execution**
```typescript
// Create ticket with automatic assignment
const ticket = await jiraService.createTicket(jiraConfig, {
  summary: "Fix React component crash in production",
  issueType: "Bug",
  priority: "High", 
  assignee: "jane.smith@company.com",  // ← Automatically assigned!
  description: "...",
  attachments: emailAttachments
});
```

## 📊 Assignment Logic Examples

### **Example 1: Bug Report**
```
📧 Email: "React component crashing - urgent fix needed!"
🏷️ Context: type=Bug, priority=High, tech=[react, javascript]

🎯 Assignment Logic:
✅ Developers get +20 points (bug suitable for devs)
✅ React experience gets +5 points (tech match) 
✅ Senior developers get +15 points (high priority)
✅ Low workload gets +15 points (capacity available)

Result: Senior React developer with low workload assigned
```

### **Example 2: Feature Request**
```
📧 Email: "Need new user dashboard feature for Q2 release"
🏷️ Context: type=Story, priority=Medium, tech=[dashboard, ui]

🎯 Assignment Logic:
✅ Product owners get +15 points (story suitable for PM)
✅ Developers get +10 points (can implement)
✅ UI experience gets +5 points (tech match)
✅ Moderate workload acceptable for medium priority

Result: Product owner or senior developer assigned
```

### **Example 3: Infrastructure Issue**
```
📧 Email: "Database performance degradation in production"
🏷️ Context: type=Incident, priority=High, tech=[database, performance]

🎯 Assignment Logic:
✅ DevOps role gets +20 points (infrastructure suitable)
✅ Database experience gets +5 points (tech match)
✅ Senior engineers get +15 points (high priority incident)
✅ Immediate availability preferred

Result: Senior DevOps engineer assigned
```

### **Example 4: Support Request**
```
📧 Email: "User can't access their account - need help"
🏷️ Context: type=Support, priority=Medium, tech=[authentication]

🎯 Assignment Logic:
✅ Support team gets +15 points (support suitable)
✅ Any developer can help (+5 points)
✅ Authentication experience gets +5 points
✅ Balanced workload preferred

Result: Support team member or available developer assigned
```

## 📈 Performance & Caching

### **User Data Caching**
```typescript
// Project users cached for 5 minutes
const cacheKey = `project_users_${projectKey}_${role}_${activeOnly}`;
const users = await getCachedData(cacheKey, fetchUsers, 5 * 60 * 1000);
```

### **Workload Calculation Optimization**
```typescript
// Parallel workload calculation for multiple users
const workloadPromises = userIds.map(id => calculateUserWorkload(id));
const workloads = await Promise.all(workloadPromises);
```

## 🚨 Error Handling & Fallbacks

### **Graceful Degradation**
```typescript
try {
  const suggestion = await suggestAssignee(context);
  if (suggestion.score > threshold) {
    return suggestion.user.emailAddress;
  }
} catch (error) {
  logger.warn('Smart assignment failed, leaving unassigned:', error);
  return null; // Fallback to manual assignment
}
```

### **Common Error Scenarios**
- **❌ Insufficient Permissions**: Feature disabled, manual assignment only
- **❌ No Active Users**: All suggestions have low scores
- **❌ API Rate Limits**: Cached data used, may be slightly stale
- **❌ Network Issues**: Graceful fallback to unassigned tickets

## 🔍 Monitoring & Debugging

### **Assignment Trace Logging**
```typescript
// Comprehensive logging in AI agent traces
🎯 Top assignee suggestion: Jane Smith (score: 65)
📊 Analyzed workload for 8 users  
👥 Retrieved 12 team members
✅ Smart assignment completed successfully (234ms)
```

### **System Configuration Endpoint**
```http
GET /api/dashboard/config
```

**Response:**
```json
{
  "features": {
    "smartAssignmentEnabled": true,
    "sprintsEnabled": true
  },
  "ai": {
    "model": "gpt-4o",
    "maxTokens": "4000"
  }
}
```

## 🎛️ Configuration Options

### **Tuning Assignment Behavior**
While not currently exposed as environment variables, the scoring algorithm can be customized by modifying these constants in `jira.service.ts`:

```typescript
// Score weights (current values)
const ROLE_MATCH_BONUS = 20;        // Role fits ticket type
const TECH_MATCH_BONUS = 5;         // Technology/skill match  
const PRIORITY_SENIOR_BONUS = 15;   // Senior dev for high priority
const LOW_WORKLOAD_BONUS = 15;      // Reward low current workload
const HIGH_WORKLOAD_PENALTY = -10;  // Penalize overloaded users
const EMAIL_MENTION_BONUS = 25;     // Strong signal from email
const OVERDUE_PENALTY = -5;         // Penalize users with overdue work
```

### **Assignment Threshold**
```typescript
// Minimum score required for automatic assignment
const MIN_ASSIGNMENT_SCORE = 20;

// If highest score < threshold → leave unassigned for manual review
if (topSuggestion.score < MIN_ASSIGNMENT_SCORE) {
  return null; // Manual assignment needed
}
```

## 🚀 Benefits

### **For Teams**
- ⚡ **Faster Response Times** - Tickets assigned immediately upon creation
- 📊 **Balanced Workloads** - AI considers current capacity automatically  
- 🎯 **Better Matching** - Skills and expertise matched to ticket requirements
- 🔄 **Reduced Manual Work** - No need to manually assign every ticket

### **For Management**
- 📈 **Improved Metrics** - Better assignment accuracy and resolution times
- 👥 **Team Utilization** - Automatic workload balancing across team members
- 🎯 **Resource Planning** - Clear visibility into team capacity and skills
- 📋 **Audit Trail** - Complete reasoning logged for assignment decisions

### **For Developers**
- 🎯 **Relevant Work** - Get tickets matched to your skills and interests
- ⚖️ **Fair Distribution** - Workload considered in assignment decisions
- 🔍 **Context Rich** - Tickets come with full email context and attachments
- 🚫 **Less Context Switching** - Fewer unrelated or poorly-scoped tickets

---

**💡 Pro Tip**: Start with smart assignment enabled and monitor the assignment quality. The AI learns from your team structure and improves assignment accuracy over time! 