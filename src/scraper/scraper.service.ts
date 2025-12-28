import { Injectable } from '@nestjs/common';
import { CreateScraperDto } from './dto/create-scraper.dto';
import { chromium, Browser, Page } from 'playwright';

@Injectable()
export class ScraperService {

  async scrapePlatform(platform: string) {
    let browser: Browser | null = null;
    try {
      // 브라우저 실행 (headless: false로 하면 브라우저 뜨는게 보임 - 디버깅용)
      browser = await chromium.launch({ headless: false });
      const page = await browser.newPage();

      const result = await this.executeScraping(platform, page);

      return {
        success: true,
        platform,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Scraping failed for ${platform}:`, error);
      return {
        success: false,
        platform,
        error: error.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async executeScraping(platform: string, page: Page) {
    switch (platform) {
      case 'wanted':
        return this.scrapeWanted(page);
      case 'jobkorea':
        return this.scrapeJobKorea(page);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async scrapeWanted(page: Page) {
    console.log('Navigating to Wanted...');
    await page.goto('https://www.wanted.co.kr');

    // 예시: 페이지 타이틀 가져오기
    const title = await page.title();

    // TODO: 실제 로그인 및 지원 내역 크롤링 로직 구현 필요
    // await page.click('button.login-button'); ...

    return {
      siteTitle: title,
      message: '원티드 스크래핑 테스트 성공 (실제 데이터 아님)'
    };
  }

  private async scrapeJobKorea(page: Page) {
    console.log('Navigating to JobKorea Login Page...');
    // 잡코리아 통합 로그인 페이지로 직접 이동
    await page.goto('https://www.jobkorea.co.kr/Login/Login_Tot.asp');

    // 페이지 로딩 대기
    await page.waitForLoadState('networkidle');

    const title = await page.title();

    // 사용자가 화면을 확인할 수 있도록 잠시 대기 (테스트용)
    console.log('Waiting for 5 seconds for visual confirmation...');
    // await page.waitForTimeout(5000);

    return {
      siteTitle: title,
      message: '잡코리아 로그인 페이지 이동 성공'
    };
  }

  // 기본 CRUD 메서드들 (필요 없으면 삭제 가능)
  create(createScraperDto: CreateScraperDto) {
    return 'This action adds a new scraper';
  }

  findAll() {
    return `This action returns all scraper`;
  }

  findOne(id: number) {
    return `This action returns a #${id} scraper`;
  }

  remove(id: number) {
    return `This action removes a #${id} scraper`;
  }
}