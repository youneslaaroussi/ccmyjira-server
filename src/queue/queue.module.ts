import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './processors/email.processor';
import { JiraModule } from '../jira/jira.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { DomainModule } from '../domain/domain.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-processing',
    }),
    JiraModule,
    AiAgentModule,
    DomainModule,
  ],
  providers: [EmailProcessor],
  exports: [BullModule],
})
export class QueueModule {}
