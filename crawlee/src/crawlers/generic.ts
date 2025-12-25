import type { Page } from 'playwright';
import type { CrawlResult } from '../types.js';
import { cleanText } from '../utils.js';
import { BaseCrawler } from './base.js';

/** 通用爬虫 - 处理未知平台 */
export class GenericCrawler extends BaseCrawler {
  platform = 'unknown' as const;

  protected getDomain(): string {
    return '';
  }

  async extract(page: Page): Promise<Partial<CrawlResult>> {
    const title = await page.title();

    const contentSelectors = [
      'article',
      'main',
      '.content',
      '.post-content',
      '.article-content',
      '#content',
      '.entry-content',
    ];

    let content = '';
    for (const selector of contentSelectors) {
      try {
        content = await page.$eval(selector, (el: Element) => el.textContent || '');
        if (content.length > 100) break;
      } catch {
        continue;
      }
    }

    if (!content) {
      content = await page.$eval('body', (el: Element) => el.textContent || '').catch(() => '');
    }

    const images = await page.$$eval(
      'img',
      (imgs: Element[]) => imgs
        .map(img => img.getAttribute('src') || '')
        .filter(src => src && !src.includes('data:') && src.length < 500)
        .slice(0, 20)
    ).catch(() => []);

    // 提取视频
    const videos = await page.evaluate(() => {
      const vids: string[] = [];
      
      // 1. video 标签
      document.querySelectorAll('video').forEach(video => {
        const src = video.src || video.getAttribute('data-src') || '';
        if (src && !vids.includes(src)) vids.push(src);
      });
      
      // 2. source 标签
      document.querySelectorAll('video source').forEach(source => {
        const src = source.getAttribute('src') || '';
        if (src && !vids.includes(src)) vids.push(src);
      });
      
      // 3. 通用视频链接模式
      const pageContent = document.body.innerHTML;
      const patterns = [
        /"(?:video_?url|videoUrl|video_src|stream_url|playUrl)"\s*:\s*"([^"]+)"/g,
        /src="([^"]+\.(?:mp4|m3u8|webm)[^"]*)"/gi,
        /data-(?:video-)?src="([^"]+\.(?:mp4|m3u8|webm)[^"]*)"/gi,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(pageContent)) !== null) {
          const url = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          if (url && !vids.includes(url)) {
            vids.push(url);
          }
        }
      }
      
      return vids.slice(0, 10);
    }).catch(() => []);

    const author = await page.$eval(
      '[rel="author"], .author, .byline, [class*="author"]',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    return {
      title,
      author: cleanText(author),
      content: cleanText(content).slice(0, 10000),
      images,
      videos,
    };
  }
}
