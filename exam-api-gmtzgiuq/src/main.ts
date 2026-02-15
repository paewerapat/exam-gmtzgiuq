import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
