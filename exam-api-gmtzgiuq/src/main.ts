import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { uploadSecurityHeaders } from './upload/upload-headers';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // nosniff + CSP sandbox on everything under /uploads (this static handler
  // and ServeStaticModule) — registered first so it runs before both.
  app.use('/uploads', uploadSecurityHeaders);

  // Serve uploaded images statically at /uploads/*
  app.use(
    '/uploads',
    require('express').static(require('path').join(process.cwd(), 'uploads')),
  );

  // Enable CORS
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    // Lets the web read the file name of downloads
    // (GET /unlock-codes/admin/batches/:id/codes.csv, task 15)
    exposedHeaders: ['Content-Disposition'],
  });

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // PORT is set by Phusion Passenger on Plesk, APP_PORT for local dev
  const port = process.env.PORT || process.env.APP_PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on port ${port}`);
  console.log(`📊 GraphQL Playground: http://localhost:${port}/graphql`);
}
bootstrap();
