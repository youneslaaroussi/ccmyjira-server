import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DemoService } from './services/demo.service';

@Module({
  imports: [ConfigModule],
  providers: [DemoService],
  exports: [DemoService],
})
export class CommonModule {} 