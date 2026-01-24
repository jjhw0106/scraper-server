import { Injectable } from '@nestjs/common';
import { CreateScraperDto } from './dto/create-scraper.dto';
import { chromium, Browser, Page } from 'playwright';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApplyHistory } from './schemas/apply-history.schema';

@Injectable()
export class ScraperService {

  constructor(
    @InjectModel(ApplyHistory.name) private applicationModel: Model<ApplyHistory>,
  ) { }

  // 1. 메인 진입점: 스크래핑 실행 후 저장 로직 호출
  async scrapePlatform(platform: string, credentials: { platformUserId: string; platformUserPw: string; appUserId: string }) {
    // userId는 credentials에서 추출 (없으면 'unknown_user')
    const appUserId = credentials?.appUserId || 'unknown_user';

    let browser: Browser | null = null;
    try {
      // headless: false -> 브라우저 동작 과정을 눈으로 확인 (디버깅용)
      browser = await chromium.launch({ headless: false });
      const page = await browser.newPage();

      // 1-1. 스크래핑 실행 (각 플랫폼별 로직 수행 및 데이터 반환)
      const rawData = await this.executeScraping(platform, page, credentials);

      // 1-2. 데이터 저장 (배열일 경우에만 처리)
      let savedCount = 0;
      if (Array.isArray(rawData)) {
        savedCount = await this.saveScrapedData(appUserId, credentials.platformUserId, platform, rawData);
      }
      return {
        success: true,
        platform,
        savedCount,
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
        // 디버깅을 위해 브라우저 종료 주석 처리
        // await browser.close();
        console.log('Browser left open for debugging. Please close it manually.');
      }
    }
  }

  // 2. 플랫폼별 분기 처리 (userId 제거됨 - 순수 스크래핑만 담당)
  private async executeScraping(platform: string, page: Page, credentials?: { platformUserId: string; platformUserPw: string; appUserId: string }) {
    switch (platform) {
      case 'wanted':
        return this.scrapeWanted(page, credentials);
      case 'jobkorea':
        return this.scrapeJobKorea(page, credentials);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // 3. 데이터 저장 전용 메서드 (DB Persistence)
  private async saveScrapedData(appUserId: string, platformUserId: string, platform: string, data: any[]) {
    const docsToSave = data.map(item => ({
      appUserId,
      platformUserId, // 스키마의 필드명과 일치
      platform,
      company: item.company,
      position: item.position,
      status: item.status,
      appliedAt: item.date || item.appliedAt || new Date().toISOString()
    }));

    // 해당 유저(appUserId)의 해당 플랫폼 데이터 삭제
    console.log(`[${platform}] Replacing data for appUser: ${appUserId}`);
    await this.applicationModel.deleteMany({ appUserId, platform });

    if (docsToSave.length > 0) {
      const result = await this.applicationModel.insertMany(docsToSave);
      console.log(`[${platform}] Saved ${result.length} new items for appUser: ${appUserId}`);
      return result.length;
    }
    return 0;
  }

  // 4. 지원 내역 조회 (Read) - appUserId 기준
  async getApplyHistory(appUserId: string) {
    return this.applicationModel.find({ appUserId })
      .sort({ appliedAt: -1 })
      .exec();
  }

  // --- 플랫폼별 상세 구현 ---

  private async scrapeWanted(page: Page, credentials?: { platformUserId: string; platformUserPw: string; appUserId: string }) {
    console.log('Navigating to Wanted...');
    await page.goto('https://www.wanted.co.kr');
    return {
      siteTitle: await page.title(),
      message: '원티드 자동 로그인 기능은 아직 구현되지 않았습니다.'
    };
  }

  private async scrapeJobKorea(page: Page, credentials?: { platformUserId: string; platformUserPw: string; appUserId: string }) {
    console.log('Navigating to JobKorea Login Page...');
    // 1. 로그인 페이지 이동
    await page.goto('https://www.jobkorea.co.kr/Login/Login_Tot.asp');

    if (credentials?.platformUserId && credentials?.platformUserPw) {
      // --- 자동 로그인 모드 ---
      console.log('Auto-login mode: Filling credentials...');
      await page.fill('#M_ID', credentials.platformUserId);
      await page.fill('#M_PWD', credentials.platformUserPw);

      console.log('Clicking login button...');
      await page.press('#M_PWD', 'Enter');

      // 로그인 결과 확인
      await page.waitForTimeout(3000);
      if (page.url().includes('Login_Tot.asp')) {
        const errorMsg = await page.locator('.error_msg').textContent().catch(() => null);
        if (errorMsg) throw new Error(`Login Failed: ${errorMsg}`);
        throw new Error('로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.');
      }
    } else {
      // --- 수동 로그인 모드 ---
      console.log('Manual login mode: Waiting for user to log in manually...');
      try {
        await page.waitForURL((url) => !url.href.includes('Login_Tot.asp'), { timeout: 120000 });
        console.log('Login detected!');
      } catch (e) {
        throw new Error('수동 로그인 시간이 초과되었습니다. (2분 내에 로그인을 완료해주세요)');
      }
    }

    console.log('Login successful! Navigating to Application Status page...');

    // 5. 입사지원 현황 페이지로 이동
    await page.goto('https://www.jobkorea.co.kr/User/ApplyMng');
    await page.waitForLoadState('domcontentloaded');

    // 팝업 제거 시도 (Legacy)
    try {
      await page.keyboard.press('Escape');
      const closeBtn = await page.$('.btn_close_layer, .btn_close_popup, .btnClose');
      if (closeBtn && await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    } catch (e) {
      // console.log('No popup or failed to close:', e);
    }

    await page.waitForTimeout(2000);

    // 6. 데이터 크롤링 (페이지네이션 적용)
    console.log('Starting data extraction with pagination...');
    let allApplications: any[] = [];
    let currentPage = 1;
    const MAX_PAGES = 5;

    while (currentPage <= MAX_PAGES) {
      console.log(`Scraping page ${currentPage}...`);

      const pageData = await page.evaluate(() => {
        const items: any[] = [];
        const rows = document.querySelectorAll('tbody tr');

        rows.forEach(row => {
          if (row.textContent?.includes('유사한 추천공고')) return;

          const company = row.querySelector('.company a')?.textContent?.trim();
          const position = row.querySelector('.description a')?.textContent?.trim();
          const date = row.querySelector('.apply-status .date')?.textContent?.trim();

          let status = row.querySelector('.apply-progress .status')?.textContent?.trim();
          if (!status) status = row.querySelector('.apply-status .status')?.textContent?.trim();

          if (company && position && status) {
            items.push({
              company,
              position,
              date: date || 'Unknown Date',
              status: status,
              platform: 'jobkorea'
            });
          }
        });
        return items;
      });

      allApplications = [...allApplications, ...pageData];
      console.log(`Page ${currentPage}: Found ${pageData.length} items.`);

      if (currentPage >= MAX_PAGES) break;

      const nextPageNum = currentPage + 1;
      const nextPageBtn = await page.getByRole('link', { name: `${nextPageNum}`, exact: true }).first();

      if (await nextPageBtn.isVisible()) {
        await nextPageBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        currentPage++;
      } else {
        console.log('No more pages found.');
        break;
      }
    }

    console.log(`Total extraction complete. Found ${allApplications.length} items across ${currentPage} pages.`);

    // 저장 로직은 제거됨. 순수 데이터만 리턴.
    return allApplications;
  }
}