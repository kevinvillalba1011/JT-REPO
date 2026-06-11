import { Global, Module } from '@nestjs/common';
import { DailySequenceService } from './daily-sequence.service';

@Global()
@Module({
  providers: [DailySequenceService],
  exports: [DailySequenceService],
})
export class DailySequenceModule {}
