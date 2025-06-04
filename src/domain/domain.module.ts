import { Module } from '@nestjs/common';
import { DomainLookupService } from './domain-lookup.service';
import { DomainController } from './domain.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DomainController],
  providers: [DomainLookupService],
  exports: [DomainLookupService],
})
export class DomainModule {} 