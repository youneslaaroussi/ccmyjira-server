import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS Configuration for AI Email Processing System
 * 
 * This configuration ensures secure cross-origin requests while allowing
 * legitimate access from approved domains.
 */

export interface CorsConfig {
  allowedOrigins: string[];
  corsOptions: CorsOptions;
}

/**
 * Get allowed origins based on environment
 */
export function getAllowedOrigins(): string[] {
  const baseOrigins = [
    // Production domains
    'https://ccmyjira.com',
    'https://www.ccmyjira.com', 
    'http://ccmyjira.com',
    'http://www.ccmyjira.com',
    
    // Local development
    'http://localhost:3000',
    'https://localhost:3000',
    'http://localhost:3001',
    'https://localhost:3001',
  ];

  // Add development origins in development mode
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
    baseOrigins.push(
      // Additional development ports
      'http://localhost:3001',
      'http://localhost:3002', 
      'http://localhost:8080',
      'http://localhost:4200', // Angular dev server
      'http://localhost:5173', // Vite dev server
      'http://localhost:8000', // Python dev server
      
      // 127.0.0.1 variants
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080',
      
      // Docker internal networking
      'http://app:3000',
      'http://frontend:3000',
    );
  }

  // Add custom origins from environment variable
  const customOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (customOrigins) {
    const additionalOrigins = customOrigins.split(',').map(origin => origin.trim());
    baseOrigins.push(...additionalOrigins);
  }

  return [...new Set(baseOrigins)]; // Remove duplicates
}

/**
 * CORS origin validation function
 */
export function corsOriginValidator(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  const allowedOrigins = getAllowedOrigins();
  
  // Allow requests with no origin (mobile apps, curl, Postman, etc.)
  if (!origin) {
    return callback(null, true);
  }
  
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  
  // Log unauthorized attempts for security monitoring
  console.warn(`🚫 CORS: Blocked request from unauthorized origin: ${origin}`);
  console.warn(`🚫 CORS: Allowed origins: ${allowedOrigins.join(', ')}`);
  
  return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
}

/**
 * Get complete CORS configuration
 */
export function getCorsConfig(): CorsConfig {
  const allowedOrigins = getAllowedOrigins();
  
  const corsOptions: CorsOptions = {
    origin: corsOriginValidator,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'Cache-Control',
      'Pragma',
      'X-Forwarded-For',
      'X-Real-IP',
      'User-Agent',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Current-Page',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
      'X-Response-Time',
    ],
    maxAge: process.env.NODE_ENV === 'production' ? 86400 : 300, // 24h in prod, 5min in dev
    optionsSuccessStatus: 200, // For legacy browser support
  };

  return {
    allowedOrigins,
    corsOptions,
  };
}

/**
 * Validate CORS configuration
 */
export function validateCorsConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const allowedOrigins = getAllowedOrigins();
  
  // Check if we have at least one allowed origin
  if (allowedOrigins.length === 0) {
    errors.push('No allowed origins configured');
  }
  
  // Validate origin formats
  allowedOrigins.forEach(origin => {
    try {
      new URL(origin);
    } catch (error) {
      errors.push(`Invalid origin format: ${origin}`);
    }
  });
  
  // Check for production security
  if (process.env.NODE_ENV === 'production') {
    const hasHttpsOrigins = allowedOrigins.some(origin => origin.startsWith('https://'));
    if (!hasHttpsOrigins) {
      errors.push('Production environment should have at least one HTTPS origin');
    }
    
    const hasLocalhostInProd = allowedOrigins.some(origin => origin.includes('localhost') || origin.includes('127.0.0.1'));
    if (hasLocalhostInProd) {
      console.warn('⚠️  Warning: Localhost origins detected in production environment');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log CORS configuration for debugging
 */
export function logCorsConfig(): void {
  const config = getCorsConfig();
  const validation = validateCorsConfig();
  
  console.log('🌐 CORS Configuration:');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Allowed Origins (${config.allowedOrigins.length}):`);
  config.allowedOrigins.forEach(origin => {
    console.log(`     - ${origin}`);
  });
  
  if (!validation.valid) {
    console.error('❌ CORS Configuration Errors:');
    validation.errors.forEach(error => {
      console.error(`     - ${error}`);
    });
  } else {
    console.log('✅ CORS Configuration is valid');
  }
  
  console.log(`   Credentials: ${config.corsOptions.credentials}`);
  console.log(`   Max Age: ${config.corsOptions.maxAge}s`);
  console.log(`   Methods: ${(config.corsOptions.methods as string[]).join(', ')}`);
} 