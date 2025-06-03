# AI-Powered Email Processing System

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com/)

A sophisticated AI-powered email processing system built with NestJS that automatically processes incoming emails via Postmark webhooks, analyzes them using GPT-4o AI agents, and intelligently manages JIRA tickets through a robust queued background processing system.

## 🎯 Overview

This system transforms email workflows into intelligent JIRA ticket management by:

- **Receiving emails** via Postmark webhooks with immediate 200 OK responses
- **Queuing background jobs** using BullMQ + Redis for scalable processing
- **Processing with AI** using GPT-4o agents that understand context and make decisions
- **Managing JIRA tickets** non-linearly - searching, updating, or creating as needed
- **Handling complex workflows** with multi-round AI conversations and tool calling

## 📚 Documentation Index

### Core Documentation
- **[🏗️ System Architecture](docs/01-architecture.md)** - Technical architecture, data flow, and component relationships
- **[⚙️ Installation & Setup](docs/02-installation.md)** - Complete setup guide from prerequisites to first run
- **[🔧 Configuration](docs/03-configuration.md)** - Environment variables, settings, and customization options

### Integration Guides
- **[🤖 AI Agent System](docs/04-ai-agent.md)** - GPT-4o integration, tool calling, and conversation management
- **[📧 Email Processing](docs/05-email-processing.md)** - Postmark webhooks, email parsing, and validation
- **[🎫 JIRA Integration](docs/06-jira-integration.md)** - JIRA API, ticket management, and sprint support
- **[⚡ Queue System](docs/07-queue-system.md)** - BullMQ, Redis, background jobs, and monitoring

### Deployment & Operations
- **[🐳 Docker Deployment](docs/08-docker-deployment.md)** - Docker Compose, containerization, and production deployment
- **[📊 Monitoring & Logging](docs/09-monitoring.md)** - Logging, metrics, health checks, and observability
- **[🔍 Troubleshooting](docs/10-troubleshooting.md)** - Common issues, debugging, and error resolution

### API & Development
- **[🔌 API Reference](docs/11-api-reference.md)** - REST endpoints, webhooks, and request/response formats
- **[🧪 Testing Guide](docs/12-testing.md)** - Unit tests, integration tests, and testing strategies
- **[🔐 Security Guide](docs/13-security.md)** - Authentication, authorization, and security best practices

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd server

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start with Docker Compose (recommended)
docker-compose up -d

# OR start locally
pnpm run start:dev
```

## 🏃‍♂️ Quick Deploy with Docker

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f

# Scale workers
docker-compose up -d --scale worker=3
```

## 🌟 Key Features

### 🧠 Intelligent Email Processing
- **Context-aware AI**: GPT-4o agents understand email content and business context
- **Multi-round conversations**: AI can perform complex workflows with multiple tool calls
- **Smart decision making**: Automatically decides whether to create, update, or comment on tickets

### 🎫 Advanced JIRA Management  
- **Search-first approach**: Always searches existing tickets before creating new ones
- **Non-linear workflows**: Updates existing tickets when appropriate (bug fixes, duplicates)
- **Sprint integration**: Automatic sprint assignment and due date management
- **Flexible ticket types**: Supports Bug, Story, Task, Epic, and Subtask creation

### ⚡ High-Performance Architecture
- **Immediate webhook responses**: Returns 200 OK instantly, processes asynchronously
- **Scalable queue system**: BullMQ with Redis for reliable background processing
- **Error resilience**: Comprehensive error handling and retry mechanisms
- **Rate limiting**: Built-in JIRA API rate limiting and backoff strategies

### 🔧 Enterprise-Ready
- **Docker containerization**: Full Docker Compose setup for easy deployment
- **Environment-based config**: Flexible configuration for different environments
- **Comprehensive logging**: Structured logging with correlation IDs
- **Health monitoring**: Built-in health checks and metrics endpoints

## 📋 System Requirements

### Minimum Requirements
- **Node.js**: 18.x or higher
- **pnpm**: 8.x or higher  
- **Redis**: 6.x or higher (or Upstash Redis Cloud)
- **Docker**: 20.x or higher (for containerized deployment)

### External Services
- **Postmark Account**: For email webhook processing
- **OpenAI API**: GPT-4o access for AI processing
- **JIRA Cloud**: For ticket management integration
- **Redis Cloud**: Upstash Redis or self-hosted Redis instance

## 🏗️ Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend Framework** | NestJS + TypeScript | RESTful API and service architecture |
| **AI Processing** | OpenAI GPT-4o | Email analysis and decision making |
| **Queue System** | BullMQ + Redis | Background job processing |
| **Email Service** | Postmark Webhooks | Inbound email processing |
| **Issue Tracking** | JIRA Cloud API | Ticket management and updates |
| **Containerization** | Docker + Docker Compose | Deployment and orchestration |
| **Package Manager** | pnpm | Fast, efficient dependency management |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Code style and standards
- Pull request process
- Development workflow
- Testing requirements

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the relevant guide in the `docs/` directory
- **Issues**: Create an issue on GitHub with detailed reproduction steps
- **Troubleshooting**: See [Troubleshooting Guide](docs/10-troubleshooting.md)

---

**Next Step**: Start with the [System Architecture](docs/01-architecture.md) to understand how everything works together, or jump to [Installation & Setup](docs/02-installation.md) to get started quickly.
