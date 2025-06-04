import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Try normal JWT authentication first
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context) {
    // If JWT authentication fails, check if we should allow demo mode
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      
      // Create demo user when authentication fails
      const demoUser = {
        id: this.configService.get('DEMO_USER_ID') || 'demo-user-12345',
        email: this.configService.get('DEMO_USER_EMAIL') || 'demo@ccmyjira.com',
        displayName: this.configService.get('DEMO_USER_NAME') || 'Demo User',
        isDemo: true,
      };
      
      // Add demo flag to request for services to use
      request.isDemo = true;
      request.demoOrganizationId = this.configService.get('DEMO_ORGANIZATION_ID') || 'demo-org-12345';
      
      return demoUser;
    }
    
    // Normal authenticated user
    const request = context.switchToHttp().getRequest();
    request.isDemo = false;
    return user;
  }
} 