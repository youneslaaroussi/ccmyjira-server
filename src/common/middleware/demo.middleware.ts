import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request interface to include demo properties
declare global {
  namespace Express {
    interface Request {
      isDemo?: boolean;
      demoUser?: {
        id: string;
        email: string;
        displayName: string;
        avatarUrl?: string;
        organizationId: string;
      };
    }
  }
}

@Injectable()
export class DemoMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DemoMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Check if the request path starts with /demo
    if (req.path.startsWith('/demo')) {
      this.logger.log(`🎭 Demo mode request: ${req.method} ${req.path}`);
      
      // Strip /demo prefix from the URL
      const originalPath = req.path;
      const originalUrl = req.url;
      const newPath = req.path.replace('/demo', '') || '/';
      const newUrl = originalUrl.replace('/demo', '') || '/';
      
      // Update request properties using Object.defineProperty to override read-only properties
      Object.defineProperty(req, 'path', {
        value: newPath,
        writable: true,
        configurable: true,
      });
      
      Object.defineProperty(req, 'url', {
        value: newUrl,
        writable: true,
        configurable: true,
      });
      
      // Set demo mode flags
      req.isDemo = true;
      req.demoUser = {
        id: this.configService.get<string>('DEMO_USER_ID') || 'demo-user-123',
        email: this.configService.get<string>('DEMO_USER_EMAIL') || 'demo@ccmyjira.com',
        displayName: this.configService.get<string>('DEMO_USER_NAME') || 'Demo User',
        organizationId: this.configService.get<string>('DEMO_ORGANIZATION_ID') || 'demo-org-123',
      };

      this.logger.log(`🔀 Routing ${req.method} ${originalPath} → ${newPath}`);
      this.logger.log(`👤 Demo user: ${req.demoUser.displayName} (${req.demoUser.email})`);
    }

    next();
  }
} 