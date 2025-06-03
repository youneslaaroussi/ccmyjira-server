# ⚙️ Installation & Setup Guide

This guide walks you through setting up the AI-powered email processing system from scratch, covering everything from prerequisites to first successful email processing.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development Setup](#local-development-setup)
- [External Services Configuration](#external-services-configuration)
- [Docker Setup](#docker-setup)
- [Verification & Testing](#verification--testing)
- [Common Issues](#common-issues)

## 🔧 Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | v18.0.0 | v18.17.0+ |
| **pnpm** | v8.0.0 | v8.6.0+ |
| **Docker** | v20.0.0 | v24.0.0+ |
| **Docker Compose** | v2.0.0 | v2.21.0+ |
| **Memory** | 4GB RAM | 8GB RAM |
| **Storage** | 2GB free | 5GB free |

### External Services Required

- **OpenAI Account**: GPT-4o API access
- **JIRA Cloud**: Admin access to a JIRA project
- **Postmark Account**: Email webhook service
- **Redis Service**: Upstash or self-hosted Redis

## 🌍 Environment Setup

### 1. Node.js & pnpm Installation

**macOS (using Homebrew):**
```bash
# Install Node.js
brew install node@18

# Install pnpm
npm install -g pnpm

# Verify installations
node --version  # Should be v18.x.x
pnpm --version  # Should be v8.x.x
```

**Windows:**
```bash
# Install Node.js from https://nodejs.org/
# Then install pnpm
npm install -g pnpm
```

**Linux (Ubuntu/Debian):**
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm
```

### 2. Docker Installation

**macOS:**
```bash
# Install Docker Desktop
brew install --cask docker

# Start Docker Desktop and verify
docker --version
docker-compose --version
```

**Windows:**
- Download Docker Desktop from https://docker.com/products/docker-desktop/
- Install and start Docker Desktop
- Verify: `docker --version` in PowerShell

**Linux:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.21.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

## 🏗️ Local Development Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone <repository-url>
cd server

# Verify project structure
ls -la
# Should see: src/, docs/, package.json, docker-compose.yml, etc.
```

### 2. Install Dependencies

```bash
# Install project dependencies
pnpm install

# Verify installation
pnpm list --depth=0

# Check for vulnerabilities
pnpm audit
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
# Windows: notepad .env
# macOS/Linux: nano .env
```

**Required Environment Variables:**
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration (Upstash recommended for development)
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_TLS=true

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=4000

# JIRA Configuration
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJ

# Postmark Configuration
POSTMARK_SERVER_TOKEN=your-postmark-server-token
POSTMARK_ACCOUNT_TOKEN=your-postmark-account-token

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_DELAY=5000

# AI Agent Configuration
AI_AGENT_TIMEOUT=30000
MAX_EMAIL_PROCESSING_RETRIES=3
MAX_ROUNDS=10

# Optional: Sprint Support
ENABLE_SPRINTS=false

# Rate Limiting
JIRA_RATE_LIMIT_DELAY=1000
```

## 🔌 External Services Configuration

### 1. OpenAI Setup

1. **Create Account**: Visit https://platform.openai.com/
2. **Get API Key**: 
   - Go to API Keys section
   - Create new secret key
   - Copy and save the key securely
3. **Set Billing**: Ensure you have billing set up for GPT-4o access
4. **Test API Key**:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer your-api-key"
   ```

### 2. JIRA Cloud Setup

1. **Create API Token**:
   - Visit https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"
   - Give it a descriptive name
   - Copy and save the token

2. **Configure Project**:
   - Ensure your JIRA project exists
   - Note the project key (e.g., "PROJ", "DEV")
   - Verify you have admin permissions

3. **Test JIRA Connection**:
   ```bash
   curl -u your-email@company.com:your-api-token \
     "https://yourcompany.atlassian.net/rest/api/3/project/PROJ"
   ```

### 3. Postmark Setup

1. **Create Account**: Visit https://postmarkapp.com/
2. **Create Server**:
   - Go to Servers → Create Server
   - Choose "Transactional" type
   - Note the Server API Token

3. **Configure Inbound**:
   - Go to Message Streams → Inbound
   - Set webhook URL: `https://yourdomain.com/webhooks/postmark`
   - Enable inbound processing

4. **Test Webhook** (optional):
   ```bash
   curl -X POST http://localhost:3000/webhooks/test \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

### 4. Redis Setup (Upstash)

1. **Create Account**: Visit https://upstash.com/
2. **Create Database**:
   - Choose Redis
   - Select region closest to your deployment
   - Note connection details

3. **Get Connection String**:
   - Copy the Redis URL
   - Extract host, port, and password

4. **Test Connection**:
   ```bash
   # Using redis-cli (if installed)
   redis-cli -h your-host -p 6379 -a your-password ping
   ```

## 🐳 Docker Setup

### 1. Development with Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps

# Stop services
docker-compose down
```

### 2. Start with Redis Admin UI

```bash
# Start with Redis management UI
docker-compose --profile tools up -d

# Access Redis Commander at http://localhost:8081
```

### 3. Local Development (No Docker)

If you prefer running without Docker:

```bash
# Ensure Redis is running (local or remote)
# Start the application
pnpm run start:dev

# In another terminal, start worker
WORKER_MODE=true pnpm run start:dev
```

## ✅ Verification & Testing

### 1. Health Check

```bash
# Check application health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### 2. Redis Connection Test

```bash
# Check Redis connectivity
docker-compose exec app node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_HOST);
redis.ping().then(console.log);
"
```

### 3. JIRA API Test

```bash
# Test JIRA connection
curl -X GET http://localhost:3000/api/jira/test

# Or check directly
docker-compose exec app node -e "
const axios = require('axios');
axios.get('https://yourcompany.atlassian.net/rest/api/3/myself', {
  auth: { username: 'your-email', password: 'your-token' }
}).then(r => console.log(r.data));
"
```

### 4. OpenAI API Test

```bash
# Test OpenAI connection
curl -X POST http://localhost:3000/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test!"}'
```

### 5. End-to-End Email Test

```bash
# Send test webhook
curl -X POST http://localhost:3000/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "From": "test@example.com",
    "Subject": "Test bug report",
    "TextBody": "There is an issue with the login page",
    "MessageID": "test-123"
  }'

# Check logs for processing
docker-compose logs -f worker
```

## 🔧 Development Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "start:worker": "WORKER_MODE=true nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "docker:dev": "docker-compose up -d",
    "docker:prod": "docker-compose -f docker-compose.prod.yml up -d",
    "docker:logs": "docker-compose logs -f",
    "redis:cli": "docker-compose exec redis redis-cli"
  }
}
```

## 🐛 Common Issues

### Issue: "Cannot connect to Redis"

**Solution:**
```bash
# Check Redis status
docker-compose ps redis

# View Redis logs
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# For Upstash, ensure TLS is enabled
REDIS_TLS=true
```

### Issue: "JIRA API 401 Unauthorized"

**Solution:**
```bash
# Verify credentials
curl -u your-email:your-token \
  https://yourcompany.atlassian.net/rest/api/3/myself

# Check API token hasn't expired
# Regenerate token if needed
```

### Issue: "OpenAI API rate limit"

**Solution:**
```bash
# Check your OpenAI usage limits
# Reduce concurrency in .env:
QUEUE_CONCURRENCY=2
MAX_ROUNDS=5

# Add delays between requests
AI_AGENT_TIMEOUT=60000
```

### Issue: "Port 3000 already in use"

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change port
PORT=3001 pnpm run start:dev
```

### Issue: "Docker build fails"

**Solution:**
```bash
# Clear Docker cache
docker system prune -a

# Rebuild with no cache
docker-compose build --no-cache

# Check Docker resources
docker system df
```

### Issue: "pnpm install fails"

**Solution:**
```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Use npm as fallback
npm install
```

## 📚 Next Steps

Once installation is complete:

1. **Configure Production**: Set up [Production Configuration](03-configuration.md)
2. **Deploy with Docker**: Follow [Docker Deployment Guide](08-docker-deployment.md)
3. **Set up Monitoring**: Configure [Monitoring & Logging](09-monitoring.md)
4. **Test Integration**: Run through [Testing Guide](12-testing.md)

## 🔗 Related Documentation

- **[System Architecture](01-architecture.md)** - Understand the system design
- **[Configuration](03-configuration.md)** - Advanced configuration options
- **[Docker Deployment](08-docker-deployment.md)** - Containerized deployment
- **[Troubleshooting](10-troubleshooting.md)** - Detailed troubleshooting guide

---

**Next**: Configure your system settings with [Configuration Guide](03-configuration.md). 