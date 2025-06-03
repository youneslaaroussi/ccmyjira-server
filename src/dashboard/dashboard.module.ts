import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JiraModule } from '../jira/jira.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    JiraModule,
    QueueModule,
    BullModule.registerQueue({
      name: 'email-processing',
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
