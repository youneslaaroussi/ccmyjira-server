import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable strict validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        console.error('🚨 Validation failed:', JSON.stringify(errors, null, 2));
        return new BadRequestException({
          message: 'Validation failed',
          errors: errors,
        });
      },
    }),
  );

  // Enable CORS for webhook endpoints
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Email processing server running on port ${port}`);
  console.log(
    `📧 Postmark webhook endpoint: http://localhost:${port}/webhooks/postmark`,
  );
  console.log(`🧪 Test endpoint: http://localhost:${port}/webhooks/test`);
}
bootstrap();
