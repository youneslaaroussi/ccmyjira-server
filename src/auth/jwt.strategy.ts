import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from './supabase.service';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  iat: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    this.logger.log('✅ JWT strategy initialized');
  }

  /**
   * Validate JWT payload and return user data
   */
  async validate(payload: JwtPayload) {
    this.logger.log(`🔍 Validating JWT for user: ${payload.email}`);

    // Get fresh user data from database
    const user = await this.supabaseService.getUserById(payload.sub);
    
    if (!user) {
      this.logger.warn(`❌ User not found for ID: ${payload.sub}`);
      return null;
    }

    // Update last login
    await this.supabaseService.updateLastLogin(user.id);

    this.logger.log(`✅ JWT validated for user: ${user.email}`);
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    };
  }
} 