import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LogLevel, ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // Patch preventivo para asegurar rutas absolutas en credenciales GCP en local Windows
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
      process.cwd(),
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    );
  }

  const logLevelsEnv = process?.env?.LOG_LEVELS || 'log,verbose,error,warn';
  const logLevels = logLevelsEnv
    .split(',')
    .map((level) => level.trim()) as LogLevel[];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Enable CORS for frontend integration
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Document Processing API')
    .setDescription('Asynchronous document processing system with OCR and AI')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  Logger.verbose(`🚀 API listing on: ${port}/api/docs`);
}
bootstrap();
