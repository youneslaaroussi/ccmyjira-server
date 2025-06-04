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

### Access Points
- **🌐 Application**: http://localhost:3000
- **📚 API Documentation (Swagger)**: http://localhost:3000/api/docs
- **🏥 Health Check**: http://localhost:3000/api/dashboard/health
- **📧 Email Webhook**: http://localhost:3000/webhooks/postmark
- **🧪 Test Endpoint**: http://localhost:3000/webhooks/test

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Redis (via Docker or cloud service like Upstash)
- OpenAI API key
- JIRA Cloud account with API access
- Postmark account for email webhooks

### Installation
```bash
# Clone and setup
git clone <repository-url>
cd server
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start with Docker (recommended)
docker-compose up -d

# Or start locally
pnpm run start:dev
```

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| **[🏗️ System Architecture](docs/01-architecture.md)** | Complete system design, components, and data flow |
| **[⚙️ Installation & Setup](docs/02-installation.md)** | Detailed installation guide for all environments |
| **[🤖 AI Agent System](docs/04-ai-agent.md)** | AI agent architecture and email processing logic |
| **[🐳 Docker Deployment](docs/08-docker-deployment.md)** | Production deployment with Docker and orchestration |
| **[🔌 API Reference](docs/11-api-reference.md)** | Complete REST API documentation |
| **[📚 API Documentation & Testing](docs/12-api-documentation.md)** | Interactive Swagger UI guide and testing workflows |

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

## ✨ Features

### 🎯 Core Features
- **Email-to-JIRA Integration**: Convert emails into actionable JIRA tickets
- **AI-Powered Analysis**: GPT-4o analyzes email content and determines optimal actions  
- **📎 Attachment Processing**: Automatic handling of email attachments and embedded images
- **Smart Assignment**: AI suggests optimal assignees based on content and team workload
- **Sprint Management**: Automatic sprint assignment and due date handling
- **Duplicate Detection**: Prevents duplicate tickets by searching existing issues
- **Context Preservation**: Maintains email threading and context in JIRA

### 📎 Attachment & Image Support

#### **Supported File Types**
- **📸 Images**: PNG, JPG, GIF, SVG (screenshots, diagrams, mockups)
- **📄 Documents**: PDF, DOC, DOCX, TXT (requirements, specs)
- **📋 Logs**: TXT, LOG files (error logs, console output)
- **💻 Code**: JS, TS, HTML, CSS, JSON (code snippets)
- **🗜️ Archives**: ZIP files (multiple file packages)
- **📊 Data**: HAR, XML, CSV (network traces, data exports)

#### **Processing Capabilities**
- **🔗 Embedded Images**: Automatically extracts and uploads images referenced with `cid:` in HTML emails
- **📧 Email Attachments**: Processes all email attachments and uploads to JIRA tickets
- **🤖 AI Context Analysis**: Uses attachment types to improve ticket categorization
- **🔒 Security**: File type validation and size limits (10MB per email)
- **📝 Content Replacement**: Replaces HTML `cid:` references with attachment notes

#### **Example Use Cases**
```
📧 Bug Report Email with:
├── 🖼️ screenshot.png (embedded: cid:bug001)
├── 📄 error-log.txt  
└── 📊 network-trace.har

🎯 Result: JIRA Bug ticket with all 3 files attached
   ├── Screenshot visible in ticket description
   ├── Error log for debugging
   └── Network trace for analysis
```
