import { PlaywrightCrawler, Configuration } from 'crawlee';
import type { Page, BrowserContext } from 'playwright';
import type { CrawlResult, Platform, CookieParam } from '../types.js';
import { nowISO, parseCookies } from '../utils.js';

// 常用 User-Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

/** 爬取选项 */
export interface CrawlOptions {
  timeout?: number;
  cookies?: CookieParam[] | string;
}

/** 平台爬虫基类 */
export abstract class BaseCrawler {
  abstract platform: Platform;
  
  /** 获取平台对应的域名 */
  protected abstract getDomain(): string;
  
  /** 从页面提取内容 */
  abstract extract(page: Page, url: string): Promise<Partial<CrawlResult>>;

  /** 获取随机 User-Agent */
  protected getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /** 注入反检测脚本 */
  protected async injectAntiDetection(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // 隐藏 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // 模拟正常的 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // 模拟正常的 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      });
      
      // 隐藏 Playwright/Puppeteer 痕迹
      // @ts-ignore
      delete window.__playwright;
      // @ts-ignore  
      delete window.__puppeteer;
    });
  }

  /** 设置 cookies 到浏览器上下文 */
  protected async setCookies(context: BrowserContext, cookies: CookieParam[]): Promise<void> {
    if (cookies.length === 0) return;
    
    const playwrightCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || this.getDomain(),
      path: c.path || '/',
    }));
    
    await context.addCookies(playwrightCookies);
  }

  /** 执行爬取 */
  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const { timeout = 30000, cookies } = options;
    const self = this;
    const parsedCookies = parseCookies(cookies, this.getDomain());
    
    return new Promise((resolve) => {
      let resolved = false;
      
      const config = new Configuration({
        persistStorage: false,
        purgeOnStart: true,
      });

      const crawler = new PlaywrightCrawler({
        requestHandlerTimeoutSecs: timeout / 1000,
        navigationTimeoutSecs: timeout / 1000,
        headless: true,
        maxRequestRetries: 1,
        
        launchContext: {
          launchOptions: {
            args: [
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
            ],
          },
        },

        // 在导航之前设置
        preNavigationHooks: [
          async ({ page }) => {
            // 设置 cookies
            if (parsedCookies.length > 0) {
              const context = page.context();
              await self.setCookies(context, parsedCookies);
            }
            
            // 设置视口
            await page.setViewportSize({ width: 1920, height: 1080 });
            
            // 设置 User-Agent
            await page.setExtraHTTPHeaders({
              'User-Agent': self.getRandomUserAgent(),
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            });
            
            // 注入反检测脚本
            await self.injectAntiDetection(page);
          },
        ],

        async requestHandler({ page, request }) {
          try {
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(2000); // 等待动态内容
            
            const extracted = await self.extract(page, request.url);
            
            resolved = true;
            resolve({
              success: true,
              platform: self.platform,
              url: request.url,
              title: extracted.title || '',
              author: extracted.author,
              content: extracted.content || '',
              images: extracted.images || [],
              videos: extracted.videos || [],
              publishedAt: extracted.publishedAt,
              crawledAt: nowISO(),
            });
          } catch (error) {
            resolved = true;
            resolve({
              success: false,
              platform: self.platform,
              url: request.url,
              title: '',
              content: '',
              images: [],
              videos: [],
              crawledAt: nowISO(),
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },

        failedRequestHandler({ request }, error) {
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              platform: self.platform,
              url: request.url,
              title: '',
              content: '',
              images: [],
              videos: [],
              crawledAt: nowISO(),
              error: error.message,
            });
          }
        },
      }, config);

      crawler.run([url]).finally(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            platform: self.platform,
            url,
            title: '',
            content: '',
            images: [],
            videos: [],
            crawledAt: nowISO(),
            error: 'Crawler finished without result',
          });
        }
      });
    });
  }
}
