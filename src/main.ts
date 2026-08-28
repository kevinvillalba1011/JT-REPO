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

  // El front nunca llama a JT-REPO directo: siempre pasa por ms-gateway-em
  // (ruta /api/jt/**), que ya agrega su propio Access-Control-Allow-Origin.
  // Si JT-REPO TAMBIÉN agrega el suyo (antes: `app.enableCors()`, sin
  // argumentos -> "*"), la respuesta proxied termina con DOS valores
  // distintos de Access-Control-Allow-Origin ("*" de acá + el del gateway),
  // lo que el navegador rechaza por CORS (spec: más de un valor = bloqueo),
  // incluso en un 200 exitoso — el body nunca llega a Angular. El gateway es
  // la única fuente de CORS para tráfico de navegador; acá no hace falta.

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

  Logger.verbose(`Api version: 2.0.0`);
}
bootstrap();
