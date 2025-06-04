import { Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraConfigService } from './jira-config.service';
import { SupabaseService } from '../auth/supabase.service';

@Module({
  providers: [JiraService, JiraConfigService, SupabaseService],
  exports: [JiraService, JiraConfigService],
})
export class JiraModule {}
