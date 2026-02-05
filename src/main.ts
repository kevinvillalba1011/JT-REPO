import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('API Test – Document AI + Gemini 2.5 Flash Lite')
    .setDescription(
      'Tres rutas de prueba: OCR (Document AI), clasificación (¿es cliente?) y extracción de datos (Gemini 2.5 Flash Lite).',
    )
    .setVersion('1.0')
    .addTag('test', 'Rutas de prueba: OCR, clasificación, extracción')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Aplicación corriendo en http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}
bootstrap();
