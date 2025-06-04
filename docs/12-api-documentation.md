# 📚 API Documentation & Testing

This document explains how to use the interactive API documentation (Swagger UI) and test the AI email processing system endpoints.

## 📋 Table of Contents

- [Accessing Swagger UI](#accessing-swagger-ui)
- [API Authentication](#api-authentication)
- [Testing Endpoints](#testing-endpoints)
- [API Groups](#api-groups)
- [Response Formats](#response-formats)
- [Common Workflows](#common-workflows)

## 🌐 Accessing Swagger UI

### Local Development
```
http://localhost:3000/api/docs
```

### Production
```
https://your-production-url.com/api/docs
```

### Features Available
- **Interactive Testing**: Execute API calls directly from the browser
- **Request/Response Examples**: See real request and response formats
- **Authentication Testing**: Test with API keys or tokens
- **Schema Validation**: Understand required and optional parameters
- **Export Options**: Download OpenAPI/Swagger specifications

## 🔐 API Authentication

Currently, the system supports basic authentication for development. For production deployments:

### Development (No Auth Required)
Most endpoints can be accessed without authentication during development.

### Production (Recommended)
```javascript
// API Key Authentication (Header)
X-API-Key: your-api-key-here

// Bearer Token Authentication
Authorization: Bearer your-jwt-token
```

### Setting Up Authentication in Swagger UI
1. Click the **"Authorize"** button (🔒) at the top right
2. Enter your API key or JWT token
3. Click **"Authorize"**
4. The authorization will persist for your session

## 🧪 Testing Endpoints

### Webhook Testing

#### Test Webhook Endpoint
```http
POST /webhooks/test
```

**Purpose**: Verify the email processing system is working
**Use Case**: System health check and debugging

**Example Response**:
```json
{
  "message": "Email webhook endpoint is working!",
  "timestamp": "2024-01-15T10:30:00Z",
  "queueStats": {
    "waiting": 2,
    "active": 1,
    "completed": 145,
    "failed": 3
  },
  "debug": {
    "emailServiceAvailable": true,
    "nodeVersion": "v18.17.0",
    "platform": "win32"
  }
}
```

#### Simulate Email Processing
```http
POST /webhooks/postmark
Content-Type: application/json

{
  "From": "test@example.com",
  "Subject": "Bug Report: Login Issue",
  "TextBody": "The login page is not working when I try to sign in",
  "MessageID": "test-123-456",
  "RecordType": "Inbound"
}
```

### Dashboard API Testing

#### Get Complete Dashboard
```http
GET /api/dashboard
```

**Returns**: System stats, JIRA data, and real-time metrics

#### Get System Statistics Only
```http
GET /api/dashboard/stats
```

**Returns**: Server uptime, memory usage, queue status

#### Search JIRA Tickets
```http
GET /api/dashboard/tickets?days=14&status=Open&search=bug
```

**Parameters**:
- `days`: Number of days to look back
- `status`: Filter by ticket status
- `assignee`: Filter by assignee email
- `search`: Search in summary/description

#### Get Smart Assignment Suggestions
```http
GET /api/dashboard/suggest-assignee?type=Bug&technologies=javascript,react&priority=High
```

**Parameters**:
- `type`: Required - Bug, Story, Task, Epic, Subtask
- `technologies`: Comma-separated list
- `priority`: Highest, High, Medium, Low, Lowest
- `component`: Component affected

## 📊 API Groups

### 🔗 Webhooks Group
- **Purpose**: Email processing and external integrations
- **Endpoints**: `/webhooks/postmark`, `/webhooks/test`, `/webhooks/health`
- **Use Case**: Receiving and processing incoming emails

### 📈 Dashboard Group  
- **Purpose**: System monitoring and JIRA integration
- **Endpoints**: All `/api/dashboard/*` endpoints
- **Use Case**: Building dashboards, monitoring system health

### 🏥 Health Group
- **Purpose**: System health monitoring
- **Endpoints**: Health check endpoints
- **Use Case**: Load balancer checks, monitoring alerts

## 📝 Response Formats

### Success Response Format
```json
{
  "data": {
    // Response data here
  },
  "status": "success",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Response Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00Z",
  "path": "/api/dashboard/tickets"
}
```

### Validation Error Format
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

## 🔄 Common Workflows

### 1. System Health Check
1. **Test Basic Health**: `GET /api/dashboard/health`
2. **Test Queue System**: `POST /webhooks/test`
3. **Check JIRA Connection**: `GET /api/dashboard/jira`

### 2. Email Processing Test
1. **Verify System Ready**: `POST /webhooks/test`
2. **Send Test Email**: `POST /webhooks/postmark` with test payload
3. **Check Queue Status**: `GET /api/dashboard/stats`
4. **Monitor Processing**: `GET /api/dashboard/queue`

### 3. JIRA Integration Test
1. **Get Project Info**: `GET /api/dashboard/project-info`
2. **List Users**: `GET /api/dashboard/users`
3. **Check Workloads**: `GET /api/dashboard/workloads`
4. **Test Assignment**: `GET /api/dashboard/suggest-assignee?type=Bug`

### 4. Dashboard Data Retrieval
1. **Get Full Dashboard**: `GET /api/dashboard`
2. **Get Recent Tickets**: `GET /api/dashboard/tickets?days=7`
3. **Get Sprint Info**: `GET /api/dashboard/sprints` (if enabled)
4. **Get System Config**: `GET /api/dashboard/config`

## 🛠️ Testing Tips

### Using Swagger UI Effectively

1. **Start with Health Checks**: Always test health endpoints first
2. **Use Try It Out**: Click "Try it out" to test endpoints interactively
3. **Check Examples**: Review example requests/responses before testing
4. **Monitor Responses**: Pay attention to status codes and error messages
5. **Use Filters**: Use search filters in the Swagger UI to find endpoints quickly

### Request Testing Best Practices

1. **Required vs Optional**: Pay attention to required parameters (marked with *)
2. **Data Types**: Ensure correct data types (string, number, boolean)
3. **Format Validation**: Follow email, date, and other format requirements
4. **Status Codes**: Understand what different HTTP status codes mean
5. **Error Handling**: Test error scenarios to understand failure modes

### Development Workflow

1. **Local Testing**: Use `http://localhost:3000/api/docs` for development
2. **Environment Variables**: Ensure proper configuration for your environment
3. **Log Monitoring**: Check server logs while testing for detailed error information
4. **Queue Monitoring**: Use dashboard endpoints to monitor background processing
5. **Cache Management**: Use refresh endpoints to clear caches when needed

## 🔗 Related Documentation

- **[API Reference](11-api-reference.md)** - Complete endpoint documentation
- **[Installation Guide](02-installation.md)** - Setting up the development environment
- **[System Architecture](01-architecture.md)** - Understanding the system design
- **[Troubleshooting](10-troubleshooting.md)** - Common issues and solutions

---

**Next**: Learn about testing strategies in [Testing Guide](13-testing.md). 