import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class DemoJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // If this is a demo request, bypass JWT validation
    if (request.isDemo && request.demoUser) {
      // Inject demo user as if they were authenticated
      request.user = {
        id: request.demoUser.id,
        email: request.demoUser.email,
        sub: request.demoUser.id,
        iat: Math.floor(Date.now() / 1000),
      };
      
      return true;
    }
    
    // Otherwise, proceed with normal JWT validation
    return super.canActivate(context);
  }
} 