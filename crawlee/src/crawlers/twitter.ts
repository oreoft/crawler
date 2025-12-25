import type { Page } from 'playwright';
import type { CrawlResult } from '../types.js';
import { cleanText } from '../utils.js';
import { BaseCrawler } from './base.js';

/** Twitter/X 爬虫 */
export class TwitterCrawler extends BaseCrawler {
  platform = 'twitter' as const;

  protected getDomain(): string {
    return '.x.com';
  }

  async extract(page: Page): Promise<Partial<CrawlResult>> {
    // Twitter 需要更多等待时间
    await page.waitForSelector('article', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const content = await page.$eval(
      'article [data-testid="tweetText"]',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const author = await page.$eval(
      'article [data-testid="User-Name"]',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const images = await page.$$eval(
      'article [data-testid="tweetPhoto"] img',
      (imgs: Element[]) => imgs.map(img => img.getAttribute('src') || '').filter(Boolean)
    ).catch(() => []);

    // 提取视频
    const videos = await page.evaluate(() => {
      const vids: string[] = [];
      
      // 辅助函数：检查是否是有效的视频链接
      const isValidVideo = (url: string) => {
        if (!url || url.startsWith('blob:')) return false;
        return url.includes('video.twimg.com') || url.includes('.mp4');
      };
      
      // 1. video 标签
      document.querySelectorAll('video').forEach(video => {
        const src = video.src || '';
        if (isValidVideo(src) && !vids.includes(src)) vids.push(src);
      });
      
      // 2. source 标签
      document.querySelectorAll('video source').forEach(source => {
        const src = source.getAttribute('src') || '';
        if (isValidVideo(src) && !vids.includes(src)) vids.push(src);
      });
      
      // 3. 从页面数据中提取 (Twitter 视频在 twimg.com)
      const pageContent = document.body.innerHTML;
      const patterns = [
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"playbackUrl"\s*:\s*"([^"]+)"/g,
        /src="([^"]*video\.twimg\.com[^"]+)"/g,
        /"variants"\s*:\s*\[[^\]]*"url"\s*:\s*"([^"]+\.mp4[^"]*)"/g,
        /"url"\s*:\s*"([^"]*video\.twimg\.com[^"]+\.mp4[^"]*)"/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(pageContent)) !== null) {
          const url = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          if (isValidVideo(url) && !vids.includes(url)) {
            vids.push(url);
          }
        }
      }
      
      return vids.slice(0, 10);
    }).catch(() => []);

    const publishedAt = await page.$eval(
      'article time',
      (el: Element) => el.getAttribute('datetime') || el.textContent || ''
    ).catch(() => '');

    const pageTitle = await page.title();

    return {
      title: cleanText(pageTitle.replace(' / X', '').replace(' on X:', ': ')),
      author: cleanText(author),
      content: cleanText(content),
      images,
      videos,
      publishedAt,
    };
  }
}
