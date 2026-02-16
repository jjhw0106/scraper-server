import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { ApplyHistory, ApplyHistorySchema } from './schemas/apply-history.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forFeature([{ name: ApplyHistory.name, schema: ApplyHistorySchema }])],
  controllers: [ScraperController],
  providers: [ScraperService],
})
export class ScraperModule { }
