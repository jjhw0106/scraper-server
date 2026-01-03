import { Controller, Post, Body, Param } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) { }

  @Post(':platform')
  scrape(@Param('platform') platform: string, @Body() body: { id: string; pw: string; userId?: string }) {
    const userId = body.userId || 'unknown_user';
    return this.scraperService.scrapePlatform(platform, { id: body.id, pw: body.pw }, userId);
  }
}