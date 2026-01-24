import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) { }

  @Post(':platform')
  scrape(@Param('platform') platform: string, @Body() body: { platformUserId: string; platformUserPw: string; appUserId: string }) {
    // body.id를 식별자(userId)로 바로 사용
    return this.scraperService.scrapePlatform(platform, body);
  }

  @Get('history/:userId')
  getHistory(@Param('userId') userId: string) {
    return this.scraperService.getApplyHistory(userId);
  }
}