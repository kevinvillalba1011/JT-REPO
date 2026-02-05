import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TestController } from './test/test.controller';
import { DocumentAiService } from './document-ai/document-ai.service';
import { GeminiService } from './gemini/gemini.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [TestController],
  providers: [DocumentAiService, GeminiService],
})
export class AppModule {}
