import type { Page } from 'playwright';
import type { CrawlResult } from '../types.js';
import { cleanText } from '../utils.js';
import { BaseCrawler } from './base.js';

/** 微信公众号爬虫 */
export class WechatCrawler extends BaseCrawler {
  platform = 'wechat' as const;

  protected getDomain(): string {
    return '.qq.com';
  }

  async extract(page: Page): Promise<Partial<CrawlResult>> {
    await page.waitForSelector('#js_content', { timeout: 10000 }).catch(() => {});

    const title = await page.$eval(
      '#activity-name, .rich_media_title',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const author = await page.$eval(
      '#js_name, .profile_nickname',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const content = await page.$eval(
      '#js_content',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const images = await page.$$eval(
      '#js_content img',
      (imgs: Element[]) => imgs.map(img => {
        return img.getAttribute('data-src') || img.getAttribute('src') || '';
      }).filter(Boolean)
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
      
      // 3. iframe 内嵌视频
      document.querySelectorAll('iframe').forEach(iframe => {
        const src = iframe.src || iframe.getAttribute('data-src') || '';
        if (src && (src.includes('video') || src.includes('v.qq.com'))) {
          if (!vids.includes(src)) vids.push(src);
        }
      });
      
      // 4. 微信视频组件 (mpvideo)
      document.querySelectorAll('[data-vidtype]').forEach(el => {
        const src = el.getAttribute('data-src') || '';
        if (src && !vids.includes(src)) vids.push(src);
      });
      
      // 5. 从页面数据中提取
      const pageContent = document.body.innerHTML;
      const patterns = [
        /data-src="([^"]+\.mp4[^"]*)"/g,
        /"url_info"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
        /"video_quality_\d+"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
        /getvideourl[^"]*"([^"]+\.mp4[^"]*)"/g,
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

    const publishedAt = await page.$eval(
      '#publish_time, .publish_time',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    return {
      title: cleanText(title),
      author: cleanText(author),
      content: cleanText(content),
      images: [...new Set(images)],
      videos,
      publishedAt: cleanText(publishedAt),
    };
  }
}
