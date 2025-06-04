import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { AtlassianOAuthStrategy } from './atlassian-oauth.strategy';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DemoJwtAuthGuard } from './demo-jwt-auth.guard';
import { EmailService } from '../emails/email.service';
import { JiraModule } from '../jira/jira.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '24h',
        },
      }),
      inject: [ConfigService],
    }),
    JiraModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseService,
    EmailService,
    AtlassianOAuthStrategy,
    JwtStrategy,
    JwtAuthGuard,
    DemoJwtAuthGuard,
  ],
  exports: [
    AuthService,
    SupabaseService,
    EmailService,
    JwtAuthGuard,
    DemoJwtAuthGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {} 