import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { JiraModule } from '../jira/jira.module';

@Module({
  imports: [JiraModule],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
