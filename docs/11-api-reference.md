# 🔌 API Reference

This document provides comprehensive API reference for all REST endpoints, webhooks, request/response formats, and integration patterns.

## 📋 Table of Contents

- [Authentication](#authentication)
- [Webhook Endpoints](#webhook-endpoints)
- [Dashboard API](#dashboard-api)
- [Health Check API](#health-check-api)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Response Formats](#response-formats)

## 🔐 Authentication

Currently, the API uses basic HTTP authentication for development. For production deployments, implement proper API key authentication or OAuth 2.0.

### Basic Authentication
```http
Authorization: Basic <base64-encoded-credentials>
```

### API Key (Recommended for Production)
```http
X-API-Key: your-api-key-here
```

## 📧 Webhook Endpoints

### Postmark Email Webhook

**Endpoint:** `POST /webhooks/postmark`

**Description:** Receives inbound emails from Postmark and queues them for AI processing.

**Request Headers:**
```http
Content-Type: application/json
User-Agent: PostmarkInbound
```

**Request Body:**
```json
{
  "FromName": "John Doe",
  "From": "john@example.com",
  "ToFull": [
    {
      "Email": "support@yourcompany.com",
      "Name": "Support Team"
    }
  ],
  "Subject": "Bug Report: Login page not working",
  "HtmlBody": "<html><body>The login page is broken...</body></html>",
  "TextBody": "The login page is broken...",
  "MessageID": "a8c1040e-db1c-4e18-ac79-bc5f5a992673",
  "Date": "2024-01-15T10:30:00Z",
  "Attachments": [
    {
      "Name": "screenshot.png",
      "Content": "base64-encoded-content",
      "ContentType": "image/png",
      "ContentLength": 54321
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "a8c1040e-db1c-4e18-ac79-bc5f5a992673",
  "jobId": "12345",
  "message": "Email queued for processing"
}
```

**Status Codes:**
- `200 OK` - Email successfully queued
- `400 Bad Request` - Invalid payload
- `500 Internal Server Error` - Processing error

### Test Webhook

**Endpoint:** `POST /webhooks/test`

**Description:** Test endpoint for debugging email processing workflows.

**Request Body:**
```json
{
  "From": "test@example.com",
  "Subject": "Test Email",
  "TextBody": "This is a test email for debugging",
  "MessageID": "test-123"
}
```

## 📊 Dashboard API

### Get Complete Dashboard

**Endpoint:** `GET /api/dashboard`

**Description:** Returns comprehensive dashboard data including system stats and JIRA information.

**Response:**
```json
{
  "systemStats": {
    "server": {
      "uptime": 86400,
      "timestamp": "2024-01-15T10:30:00Z",
      "nodeVersion": "v18.17.0",
      "environment": "production"
    },
    "queue": {
      "name": "email-processing",
      "waiting": 2,
      "active": 1,
      "completed": 145,
      "failed": 3,
      "delayed": 0,
      "paused": false
    },
    "memory": {
      "used": 256,
      "free": 768,
      "total": 1024,
      "percentage": 25
    },
    "processing": {
      "totalJobsProcessed": 148,
      "averageProcessingTime": 2500,
      "successRate": 98
    }
  },
  "jiraData": {
    "projectInfo": {
      "key": "PROJ",
      "name": "My Project",
      "description": "Project description",
      "issueTypes": ["Bug", "Story", "Task"],
      "priorities": ["Highest", "High", "Medium", "Low"],
      "statuses": ["To Do", "In Progress", "Done"]
    },
    "statistics": {
      "totalTickets": 245,
      "openTickets": 67,
      "closedTickets": 178,
      "ticketsByType": {
        "Bug": 89,
        "Story": 124,
        "Task": 32
      },
      "averageResolutionTime": 5.2
    },
    "teamInfo": {
      "totalUsers": 8,
      "activeUsers": 7,
      "userWorkloads": [
        {
          "accountId": "user123",
          "username": "john.doe",
          "displayName": "John Doe",
          "totalTickets": 12,
          "inProgressTickets": 3,
          "todoTickets": 9,
          "storyPoints": 21,
          "overdue": 1
        }
      ]
    }
  },
  "lastUpdated": "2024-01-15T10:30:00Z"
}
```

### Get System Statistics

**Endpoint:** `GET /api/dashboard/stats`

**Description:** Returns only system statistics (server, queue, memory, processing).

**Response:**
```json
{
  "server": {
    "uptime": 86400,
    "timestamp": "2024-01-15T10:30:00Z",
    "nodeVersion": "v18.17.0",
    "environment": "production"
  },
  "queue": {
    "name": "email-processing",
    "waiting": 2,
    "active": 1,
    "completed": 145,
    "failed": 3,
    "delayed": 0,
    "paused": false
  },
  "memory": {
    "used": 256,
    "free": 768,
    "total": 1024,
    "percentage": 25
  },
  "processing": {
    "totalJobsProcessed": 148,
    "averageProcessingTime": 2500,
    "successRate": 98
  }
}
```

### Get JIRA Tickets

**Endpoint:** `GET /api/dashboard/tickets`

**Description:** Get JIRA tickets with optional filtering.

**Query Parameters:**
- `days` (number) - Number of days to look back (default: 7)
- `status` (string) - Filter by ticket status
- `assignee` (string) - Filter by assignee
- `search` (string) - Search in summary/description

**Example Request:**
```http
GET /api/dashboard/tickets?days=14&status=Open&search=login
```

**Response:**
```json
[
  {
    "key": "PROJ-123",
    "id": "10001",
    "summary": "Fix login page bug",
    "description": "Users cannot log in with valid credentials",
    "status": "In Progress",
    "issueType": "Bug",
    "priority": "High",
    "assignee": "john.doe@company.com",
    "created": "2024-01-10T14:30:00Z",
    "updated": "2024-01-15T09:15:00Z",
    "labels": ["frontend", "urgent"],
    "components": ["authentication"],
    "storyPoints": 5,
    "dueDate": "2024-01-20"
  }
]
```

### Get Project Users

**Endpoint:** `GET /api/dashboard/users`

**Description:** Get all users with access to the JIRA project.

**Query Parameters:**
- `role` (string) - Filter by role (optional)
- `activeOnly` (boolean) - Only active users (default: true)

**Response:**
```json
[
  {
    "accountId": "user123",
    "username": "john.doe",
    "emailAddress": "john.doe@company.com",
    "displayName": "John Doe",
    "active": true,
    "avatarUrls": {
      "48x48": "https://avatar-url.com/john.png"
    },
    "roles": ["Developers", "Users"]
  }
]
```

### Get User Workloads

**Endpoint:** `GET /api/dashboard/workloads`

**Description:** Get current workload information for users.

**Query Parameters:**
- `userIds` (string) - Comma-separated list of user account IDs (optional)

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

**Endpoint:** `GET /api/dashboard/suggest-assignee`

**Description:** Get AI suggestions for ticket assignment based on context.

**Query Parameters:**
- `type` (string, required) - Ticket type (Bug, Story, Task, etc.)
- `technologies` (string) - Comma-separated technologies
- `priority` (string) - Ticket priority
- `component` (string) - Component affected

**Example Request:**
```http
GET /api/dashboard/suggest-assignee?type=Bug&technologies=javascript,react&priority=High
```

**Response:**
```json
{
  "suggestions": [
    {
      "user": {
        "accountId": "user123",
        "displayName": "John Doe",
        "emailAddress": "john.doe@company.com"
      },
      "score": 85,
      "reasoning": [
        "Developer/Engineer role suitable for bug fixes",
        "Low current workload",
        "Skills match: javascript, react"
      ]
    }
  ]
}
```

### Get Sprint Information

**Endpoint:** `GET /api/dashboard/sprints`

**Description:** Get sprint information (if sprints are enabled).

**Response:**
```json
{
  "activeSprints": [
    {
      "id": 123,
      "name": "Sprint 15",
      "state": "active",
      "startDate": "2024-01-08T00:00:00Z",
      "endDate": "2024-01-22T00:00:00Z",
      "goal": "Complete login improvements"
    }
  ],
  "upcomingSprints": [
    {
      "id": 124,
      "name": "Sprint 16",
      "state": "future",
      "startDate": "2024-01-22T00:00:00Z",
      "endDate": "2024-02-05T00:00:00Z"
    }
  ],
  "completedSprints": []
}
```

### Get Queue Details

**Endpoint:** `GET /api/dashboard/queue`

**Description:** Get detailed queue statistics and recent jobs.

**Response:**
```json
{
  "stats": {
    "name": "email-processing",
    "waiting": 2,
    "active": 1,
    "completed": 145,
    "failed": 3,
    "delayed": 0,
    "paused": false
  },
  "recentJobs": {
    "waiting": [
      {
        "id": "job-456",
        "name": "process-email",
        "data": {
          "from": "user@example.com",
          "subject": "Bug report"
        },
        "timestamp": 1705312200000
      }
    ],
    "active": [
      {
        "id": "job-455",
        "name": "process-email",
        "timestamp": 1705312180000,
        "processedOn": 1705312185000
      }
    ],
    "completed": [],
    "failed": []
  }
}
```

### Get System Configuration

**Endpoint:** `GET /api/dashboard/config`

**Description:** Get system configuration and feature flags.

**Response:**
```json
{
  "features": {
    "sprintsEnabled": true,
    "smartAssignmentEnabled": true
  },
  "jira": {
    "projectKey": "PROJ",
    "baseUrl": "https://company.atlassian.net"
  },
  "queue": {
    "concurrency": "5",
    "maxAttempts": "3"
  },
  "ai": {
    "model": "gpt-4o",
    "maxTokens": "4000",
    "maxRounds": "10"
  },
  "environment": "production",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Refresh Caches

**Endpoint:** `POST /api/dashboard/refresh`

**Description:** Clear all caches to force fresh data retrieval.

**Response:**
```json
{
  "success": true,
  "message": "Caches cleared successfully"
}
```

## 🏥 Health Check API

### Health Status

**Endpoint:** `GET /api/dashboard/health`

**Description:** Get system health status including all dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "queue": {
      "healthy": true
    },
    "jira": {
      "healthy": true
    }
  }
}
```

### Simple Health Check

**Endpoint:** `GET /health`

**Description:** Simple health check endpoint for load balancers.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🚨 Error Handling

### Standard Error Response Format

All API endpoints return errors in a consistent format:

```json
{
  "statusCode": 400,
  "message": "Invalid request parameters",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00Z",
  "path": "/api/dashboard/tickets"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Authentication required |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Server-side error |
| `502` | Bad Gateway - External service error |
| `503` | Service Unavailable - System overloaded |

### Error Examples

**Validation Error:**
```json
{
  "statusCode": 400,
  "message": [
    "From must be a valid email address",
    "Subject must not be empty"
  ],
  "error": "Bad Request"
}
```

**JIRA API Error:**
```json
{
  "statusCode": 502,
  "message": "Failed to create JIRA ticket: Invalid issue type",
  "error": "Bad Gateway"
}
```

**Rate Limit Error:**
```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Too Many Requests",
  "retryAfter": 60
}
```

## ⚡ Rate Limiting

### Default Limits

- **Webhook endpoints:** 100 requests per minute per IP
- **Dashboard API:** 1000 requests per minute per API key
- **JIRA API calls:** 1 request per second (configurable)

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705312800
```

## 📝 Response Formats

### Pagination

Large datasets are paginated using cursor-based pagination:

```json
{
  "data": [...],
  "pagination": {
    "hasNext": true,
    "hasPrevious": false,
    "nextCursor": "eyJpZCI6MTIzfQ==",
    "previousCursor": null,
    "total": 245
  }
}
```

### Date Formats

All dates are in ISO 8601 format with UTC timezone:
```
2024-01-15T10:30:00Z
```

### Filtering and Sorting

Many endpoints support filtering and sorting via query parameters:

```http
GET /api/dashboard/tickets?status=Open&assignee=john@example.com&sort=created&order=desc
```

## 🔗 Related Documentation

- **[System Architecture](01-architecture.md)** - Overall system design
- **[Configuration](03-configuration.md)** - Environment variables and settings
- **[Docker Deployment](08-docker-deployment.md)** - Production deployment
- **[Troubleshooting](10-troubleshooting.md)** - Common issues and solutions

---

**Next**: Explore testing strategies in [Testing Guide](12-testing.md). 