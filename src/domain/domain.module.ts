import { Module } from '@nestjs/common';
import { DomainLookupService } from './domain-lookup.service';
import { DomainController } from './domain.controller';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [DomainController],
  providers: [DomainLookupService],
  exports: [DomainLookupService],
})
export class DomainModule {} 