import { Injectable } from '@nestjs/common';
import { CreateScraperDto } from './dto/create-scraper.dto';
import { chromium, Browser, Page } from 'playwright';

@Injectable()
export class ScraperService {

  // credentials 객체 추가 (id, password)
  async scrapePlatform(platform: string, credentials?: { id: string; pw: string }) {
    let browser: Browser | null = null;
    try {
      // headless: false -> 브라우저 동작 과정을 눈으로 확인 (디버깅용)
      browser = await chromium.launch({ headless: false });
      const page = await browser.newPage();

      const result = await this.executeScraping(platform, page, credentials);

      return {
        success: true,
        platform,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Scraping failed for ${platform}:`, error);
      // 스크린샷 저장 (에러 발생 시점 디버깅용)
      // if (page) await page.screenshot({ path: `error_${platform}.png` });

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

  private async executeScraping(platform: string, page: Page, credentials?: { id: string; pw: string }) {
    switch (platform) {
      case 'wanted':
        return this.scrapeWanted(page, credentials);
      case 'jobkorea':
        return this.scrapeJobKorea(page, credentials);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async scrapeWanted(page: Page, credentials?: { id: string; pw: string }) {
    console.log('Navigating to Wanted...');
    await page.goto('https://www.wanted.co.kr');
    // 원티드는 소셜 로그인이 많아서 복잡할 수 있음. 추후 구현.
    return {
      siteTitle: await page.title(),
      message: '원티드 자동 로그인 기능은 아직 구현되지 않았습니다.'
    };
  }

  private async scrapeJobKorea(page: Page, credentials?: { id: string; pw: string }) {
    console.log('Navigating to JobKorea Login Page...');
    // 1. 로그인 페이지 이동
    await page.goto('https://www.jobkorea.co.kr/Login/Login_Tot.asp');

    if (credentials?.id && credentials?.pw) {
      // --- 자동 로그인 모드 ---
      console.log('Auto-login mode: Filling credentials...');
      await page.fill('#M_ID', credentials.id);
      await page.fill('#M_PWD', credentials.pw);

      console.log('Clicking login button...');
      await page.press('#M_PWD', 'Enter');

      // 로그인 결과 확인 (잠시 대기 후 URL 체크)
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
        // 로그인 페이지를 벗어날 때까지 대기 (최대 2분)
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

    // [강력한 팝업 및 백드롭 제거]
    // await this.removePopups(page);

    // 팝업이 뜰 경우를 대비해 닫기 시도 (Legacy)
    try {
      console.log('Attempting to close popups (Legacy method)...');
      await page.keyboard.press('Escape'); // ESC 키로 닫기 시도
      const closeBtn = await page.$('.btn_close_layer, .btn_close_popup, .btnClose');
      if (closeBtn && await closeBtn.isVisible()) {
        await closeBtn.click();
        console.log('Popup closed via button click.');
      }
    } catch (e) {
      console.log('No popup or failed to close:', e);
    }

    // 페이지가 안정될 때까지 잠시 대기
    await page.waitForTimeout(2000);

    // 6. 데이터 크롤링 (페이지네이션 적용)
    console.log('Starting data extraction with pagination...');
    let allApplications: any[] = [];
    let currentPage = 1;
    const MAX_PAGES = 5;

    while (currentPage <= MAX_PAGES) {
      console.log(`Scraping page ${currentPage}...`);

      // 매 페이지마다 팝업/방해 요소 제거 시도
      // await this.removePopups(page);

      const pageData = await page.evaluate(() => {
        const items: any[] = [];
        const rows = document.querySelectorAll('tbody tr');

        rows.forEach(row => {
          // 추천 공고(광고) 행 제외
          if (row.textContent?.includes('유사한 추천공고')) return;

          const company = row.querySelector('.company a')?.textContent?.trim();
          const position = row.querySelector('.description a')?.textContent?.trim();
          const date = row.querySelector('.apply-status .date')?.textContent?.trim();

          let status = row.querySelector('.apply-progress .status')?.textContent?.trim();
          if (!status) status = row.querySelector('.apply-status .status')?.textContent?.trim();

          // 유효한 지원 내역인지 검증 (회사명, 공고명, 상태값이 모두 있어야 함)
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
        // 클릭 전 한 번 더 확실하게 제거
        // await this.removePopups(page);
        await nextPageBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000); // 렌더링 대기
        currentPage++;
      } else {
        console.log('No more pages found.');
        break;
      }
    }

    console.log(`Total extraction complete. Found ${allApplications.length} items across ${currentPage} pages.`);

    return {
      message: 'Scraping completed',
      count: allApplications.length,
      data: allApplications
    };
  }

  // 팝업 및 방해 요소 제거 헬퍼 메서드
  private async removePopups(page: Page) {
    await page.evaluate(() => {
      try {
        const overlays = document.querySelectorAll('.popup_layer, .layer_wrap, .modal, .tip_layer, .mtuLayer, .mtuLayerWrap, .dim, .dimmed, .mask, .backdrop, .blockUI, .ui-widget-overlay');
        overlays.forEach(el => el.remove());

        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
        document.documentElement.style.overflow = 'auto';
        // console.log('Cleaned up ' + overlays.length + ' blocking elements.');
      } catch (e) {
        // console.log('Overlay removal error:', e);
      }
    });
  }

  // ... CRUD 메서드 (생략)
  create(createScraperDto: CreateScraperDto) { return 'action'; }
  findAll() { return 'action'; }
  findOne(id: number) { return 'action'; }
  remove(id: number) { return 'action'; }
}
