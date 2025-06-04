import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { JiraModule } from '../jira/jira.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [JiraModule, CommonModule],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
