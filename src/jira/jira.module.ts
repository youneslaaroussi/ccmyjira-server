import { Module, Scope } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraConfigService } from './jira-config.service';
import { SupabaseService } from '../auth/supabase.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [
    JiraService,
    {
      provide: JiraConfigService,
      useClass: JiraConfigService,
      scope: Scope.REQUEST,
    },
    SupabaseService,
  ],
  exports: [JiraService, JiraConfigService],
})
export class JiraModule {}
