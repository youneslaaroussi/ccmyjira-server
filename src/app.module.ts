import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmailModule } from './email/email.module';
import { QueueModule } from './queue/queue.module';
import { JiraModule } from './jira/jira.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { DomainModule } from './domain/domain.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { DemoService } from './common/services/demo.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        tls: process.env.REDIS_HOST?.includes('upstash.io') ? {} : undefined,
      },
    }),
    CommonModule,
    AuthModule,
    EmailModule,
    QueueModule,
    JiraModule,
    AiAgentModule,
    DashboardModule,
    DomainModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, DemoService],
})
export class AppModule {}
