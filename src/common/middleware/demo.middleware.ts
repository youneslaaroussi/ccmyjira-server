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
    this.logger.log(`[DemoMiddleware] Incoming request: ${req.method} ${req.originalUrl || req.url}`); // Log originalUrl

    // Check if the request path starts with /demo
    if (req.path.startsWith('/demo')) {
      this.logger.log(`[DemoMiddleware] 🎭 Demo mode path detected: ${req.path}. Activating demo mode.`);
      
      // Strip /demo prefix from the URL
      const originalPath = req.path;
      const originalUrl = req.url; // req.url also contains query params
      const newPath = req.path.replace('/demo', '') || '/';
      // Ensure query parameters are preserved when rewriting req.url
      const urlParts = req.url.split('?');
      const basePath = urlParts[0].replace('/demo', '') || '/';
      const queryString = urlParts.length > 1 ? `?${urlParts[1]}` : '';
      const newUrl = basePath + queryString;
      
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

      this.logger.log(`[DemoMiddleware] 🔀 Routing ${req.method} ${originalPath} (original) → ${newPath} (modified)`);
      this.logger.log(`[DemoMiddleware]    Original URL: ${originalUrl}, Modified URL: ${newUrl}`);
      this.logger.log(`[DemoMiddleware] 👤 Demo user set: ${req.demoUser.displayName} (${req.demoUser.email}), req.isDemo = ${req.isDemo}`);
    } else {
      this.logger.log(`[DemoMiddleware]  jalur non-demo terdeteksi: ${req.path}. req.isDemo diatur ke false.`); // "jalur non-demo terdeteksi" means "non-demo path detected"
      req.isDemo = false; // Explicitly set to false for non-demo paths
    }

    next();
  }
} 