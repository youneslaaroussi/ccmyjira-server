import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getCorsConfig, logCorsConfig, validateCorsConfig } from './config/cors.config';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure larger payload limits for email attachments
  const payloadLimit = '50mb';
  console.log(`📦 Configuring body parser with ${payloadLimit} limit for email attachments`);

  // Global body parser configuration for large payloads
  const bodyParserOptions = {
    // JSON payload limit - 50MB for emails with base64 attachments
    limit: payloadLimit,
    // Parameter limit for complex nested objects
    parameterLimit: 50000,
  };

  // Apply body parser middleware with increased limits
  app.use(bodyParser.json(bodyParserOptions));
  app.use(bodyParser.urlencoded({ 
    ...bodyParserOptions, 
    extended: true,
    // Additional URL-encoded specific limits
    parameterLimit: 50000,
  }));
  app.use(bodyParser.raw({ 
    ...bodyParserOptions, 
    type: 'application/octet-stream' 
  }));

  console.log(`✅ Body parser configured: JSON limit=${payloadLimit}, URL-encoded limit=${payloadLimit}`);

  // CORS Configuration
  const corsConfig = getCorsConfig();
  const corsValidation = validateCorsConfig();
  
  // Validate CORS configuration before applying
  if (!corsValidation.valid) {
    console.error('❌ CORS Configuration is invalid:');
    corsValidation.errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
  
  // Apply CORS configuration
  app.enableCors(corsConfig.corsOptions);
  
  // Log CORS configuration for debugging
  logCorsConfig();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('AI Email Processing System')
    .setDescription(`
      Comprehensive AI-powered email processing system with smart JIRA ticket assignment.
      
      ## Features
      - **Smart Email Processing**: AI-powered analysis of incoming emails
      - **Intelligent Ticket Assignment**: Automatic assignment based on user workload and expertise
      - **Real-time Dashboard**: System metrics, queue monitoring, and JIRA integration
      - **Webhook Integration**: Postmark email processing webhooks
      - **Health Monitoring**: Complete system health checks and monitoring
      
      ## Authentication
      Currently using basic authentication for development. Production deployments should implement proper API key authentication.
      
      ## Rate Limiting
      - Webhook endpoints: 100 requests/minute per IP
      - Dashboard API: 1000 requests/minute per API key
      - JIRA API calls: 1 request/second (configurable)
      
      ## CORS Policy
      This API accepts requests from:
      - **ccmyjira.com** (production domain)
      - **localhost:3000** (development)
      - Additional development origins in development mode
      - Custom origins via CORS_ALLOWED_ORIGINS environment variable
      
      Total allowed origins: ${corsConfig.allowedOrigins.length}
    `)
    .setVersion('1.0.0')
    .setContact(
      'Development Team',
      'https://github.com/your-org/ccmyjira',
      'dev@yourcompany.com'
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://ccmyjira.com', 'Production Server')
    .addTag('webhooks', 'Email webhook endpoints for processing incoming emails')
    .addTag('dashboard', 'Dashboard API for system metrics and JIRA data')
    .addTag('health', 'Health check and monitoring endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'AI Email Processing API',
    customfavIcon: '/favicon.ico',
    customCss: `
      .topbar-wrapper .link {
        content: url('https://nestjs.com/img/logo-small.svg');
        width: 120px;
        height: auto;
      }
      .swagger-ui .topbar { background-color: #1a1a1a; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Email processing server running on port ${port}`);
  console.log(`📧 Postmark webhook endpoint: http://localhost:${port}/webhooks/postmark`);
  console.log(`🧪 Test endpoint: http://localhost:${port}/webhooks/test`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${port}/api/dashboard/health`);
}
bootstrap();
