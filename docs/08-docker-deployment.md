# 🐳 Docker Deployment Guide

This comprehensive guide covers containerizing and deploying the AI-powered email processing system using Docker and Docker Compose for both development and production environments.

## 📋 Table of Contents

- [Docker Overview](#docker-overview)
- [Docker Compose Setup](#docker-compose-setup)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Container Orchestration](#container-orchestration)
- [Monitoring & Logging](#monitoring--logging)
- [Scaling & Performance](#scaling--performance)
- [Troubleshooting](#troubleshooting)

## 🎯 Docker Overview

The system uses a multi-container architecture with the following components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   Worker Pool   │    │   Redis Queue   │
│   (API Server)  │    │ (Background     │    │   (BullMQ)      │
│                 │    │  Processors)    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                │
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (nginx)       │
                    └─────────────────┘
```

## 🛠️ Docker Compose Setup

### Base Docker Compose Configuration

First, let's create the main `docker-compose.yml` for development:

```yaml
version: '3.8'

services:
  # Main Application Server
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    container_name: email-processor-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
    env_file:
      - .env
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - email-processor-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Background Job Workers
  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    container_name: email-processor-worker
    environment:
      - NODE_ENV=development
      - WORKER_MODE=true
    env_file:
      - .env
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - email-processor-network
    command: npm run start:worker
    healthcheck:
      test: ["CMD", "node", "scripts/worker-health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Redis Queue Database
  redis:
    image: redis:7-alpine
    container_name: email-processor-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-devpassword}
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - email-processor-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 3s
      retries: 5

  # Redis Admin UI (Development Only)
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: email-processor-redis-ui
    environment:
      - REDIS_HOSTS=local:redis:6379:0:${REDIS_PASSWORD:-devpassword}
    ports:
      - "8081:8081"
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - email-processor-network
    profiles:
      - tools

volumes:
  redis_data:
    driver: local

networks:
  email-processor-network:
    driver: bridge
```

### Production Docker Compose Configuration

Create `docker-compose.prod.yml` for production deployment:

```yaml
version: '3.8'

services:
  # Load Balancer
  nginx:
    image: nginx:alpine
    container_name: email-processor-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - email-processor-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Main Application Server (Multiple Instances)
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - email-processor-network
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Background Job Workers (Scalable)
  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
      - WORKER_MODE=true
    env_file:
      - .env.production
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - email-processor-network
    command: npm run start:worker
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    healthcheck:
      test: ["CMD", "node", "scripts/worker-health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Redis (Production Configuration)
  redis:
    image: redis:7-alpine
    container_name: email-processor-redis
    command: redis-server /usr/local/etc/redis/redis.conf
    volumes:
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
      - redis_data:/data
    restart: unless-stopped
    networks:
      - email-processor-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 3s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "3"

  # Monitoring (Optional)
  prometheus:
    image: prom/prometheus:latest
    container_name: email-processor-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    restart: unless-stopped
    networks:
      - email-processor-network
    profiles:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: email-processor-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    restart: unless-stopped
    networks:
      - email-processor-network
    profiles:
      - monitoring

volumes:
  redis_data:
    driver: local
  nginx_logs:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local

networks:
  email-processor-network:
    driver: bridge
```

## 🏗️ Dockerfile Configuration

Create a multi-stage `Dockerfile`:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN pnpm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install pnpm and dumb-init
RUN npm install -g pnpm && \
    apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/main"]

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Install pnpm and development tools
RUN npm install -g pnpm && \
    apk add --no-cache curl

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start in development mode
CMD ["pnpm", "run", "start:dev"]
```

## 🚀 Development Deployment

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd server

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### Development Commands

```bash
# Start with live reload
docker-compose up app worker

# Start with Redis admin UI
docker-compose --profile tools up -d

# Rebuild containers
docker-compose build --no-cache

# Run tests in container
docker-compose exec app pnpm test

# Access application shell
docker-compose exec app sh

# View worker logs
docker-compose logs -f worker

# Scale workers
docker-compose up -d --scale worker=3
```

## 🏭 Production Deployment

### Pre-deployment Checklist

- [ ] Production environment variables configured
- [ ] SSL certificates obtained and configured
- [ ] Domain DNS configured
- [ ] Firewall rules configured
- [ ] Monitoring setup verified
- [ ] Backup procedures tested

### Production Deployment Steps

```bash
# 1. Prepare production environment
cp .env.example .env.production
# Edit .env.production with production values

# 2. Create production directories
mkdir -p nginx/ssl
mkdir -p redis
mkdir -p monitoring

# 3. Configure nginx
cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            access_log off;
            proxy_pass http://app/health;
        }
    }
}
EOF

# 4. Configure Redis
cat > redis/redis.conf << 'EOF'
bind 0.0.0.0
port 6379
requirepass yourredispassword
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF

# 5. Deploy to production
docker-compose -f docker-compose.prod.yml up -d

# 6. Verify deployment
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs app
```

### SSL Configuration

For Let's Encrypt SSL certificates:

```bash
# Install certbot
sudo apt-get install certbot

# Get SSL certificate
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem

# Set up automatic renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet && docker-compose -f docker-compose.prod.yml restart nginx" | sudo crontab -
```

## 🔧 Container Orchestration

### Environment Variables

Create `scripts/env-validator.js`:

```javascript
const requiredVars = [
  'REDIS_HOST',
  'REDIS_PORT', 
  'OPENAI_API_KEY',
  'POSTMARK_SERVER_TOKEN',
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log('All required environment variables are set');
```

### Health Check Scripts

Create `scripts/worker-health-check.js`:

```javascript
const Redis = require('ioredis');

async function checkWorkerHealth() {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });

    // Check Redis connection
    await redis.ping();
    
    // Check queue status
    const queueLength = await redis.llen('bull:email-processing:waiting');
    const processingLength = await redis.llen('bull:email-processing:active');
    
    console.log(`Queue status - Waiting: ${queueLength}, Processing: ${processingLength}`);
    
    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Worker health check failed:', error.message);
    process.exit(1);
  }
}

checkWorkerHealth();
```

### Scaling Configuration

Create `docker-compose.scale.yml`:

```yaml
version: '3.8'

services:
  app:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 60s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s

  worker:
    deploy:
      replicas: 5
      update_config:
        parallelism: 2
        delay: 10s
        failure_action: rollback
        monitor: 60s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
```

## 📊 Monitoring & Logging

### Prometheus Configuration

Create `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'email-processor'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:80']
```

### Log Management

Configure centralized logging with Docker:

```bash
# Configure log rotation
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

# Restart Docker daemon
sudo systemctl restart docker
```

### Monitoring Commands

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f app

# Monitor resource usage
docker stats

# View container health
docker-compose -f docker-compose.prod.yml ps

# Access Prometheus metrics
curl http://localhost:9090/metrics

# Check queue status
docker-compose -f docker-compose.prod.yml exec redis redis-cli info replication
```

## ⚡ Scaling & Performance

### Horizontal Scaling

```bash
# Scale application servers
docker-compose -f docker-compose.prod.yml up -d --scale app=3

# Scale workers
docker-compose -f docker-compose.prod.yml up -d --scale worker=5

# Scale with resource limits
docker-compose -f docker-compose.scale.yml up -d
```

### Performance Tuning

Create `docker-compose.override.yml` for performance optimizations:

```yaml
version: '3.8'

services:
  app:
    environment:
      - NODE_OPTIONS=--max-old-space-size=1024
      - QUEUE_CONCURRENCY=10
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G

  worker:
    environment:
      - NODE_OPTIONS=--max-old-space-size=512
      - WORKER_CONCURRENCY=5
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  redis:
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

## 🔍 Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check logs
docker-compose logs <service-name>

# Check container status
docker ps -a

# Inspect container
docker inspect <container-id>
```

**Network connectivity issues:**
```bash
# Test network connectivity
docker-compose exec app ping redis

# Check network configuration
docker network ls
docker network inspect email-processor-network
```

**Performance issues:**
```bash
# Monitor resource usage
docker stats --no-stream

# Check Redis memory usage
docker-compose exec redis redis-cli info memory

# View queue status
docker-compose exec redis redis-cli llen bull:email-processing:waiting
```

### Debug Mode

```bash
# Start in debug mode
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up

# Access container shell
docker-compose exec app sh

# Run tests
docker-compose exec app pnpm test

# Check environment variables
docker-compose exec app env | grep -E "REDIS|JIRA|OPENAI"
```

### Backup & Recovery

```bash
# Backup Redis data
docker-compose exec redis redis-cli --rdb /data/backup.rdb

# Create volume backup
docker run --rm -v email-processor_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz /data

# Restore volume
docker run --rm -v email-processor_redis_data:/data -v $(pwd):/backup alpine tar xzf /backup/redis-backup.tar.gz -C /
```

## 🔗 Related Documentation

- **[Configuration](03-configuration.md)** - Environment variables and settings
- **[Queue System](07-queue-system.md)** - Background job processing
- **[Monitoring & Logging](09-monitoring.md)** - Observability and debugging
- **[Troubleshooting](10-troubleshooting.md)** - Common issues and solutions

---

**Next**: Set up monitoring and observability with [Monitoring & Logging](09-monitoring.md). 