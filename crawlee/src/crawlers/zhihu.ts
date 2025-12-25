import type { Page } from 'playwright';
import type { CrawlResult } from '../types.js';
import { cleanText } from '../utils.js';
import { BaseCrawler } from './base.js';

/** 知乎爬虫 */
export class ZhihuCrawler extends BaseCrawler {
  platform = 'zhihu' as const;

  protected getDomain(): string {
    return '.zhihu.com';
  }

  async extract(page: Page, url: string): Promise<Partial<CrawlResult>> {
    // 等待内容加载
    await page.waitForSelector('.Post-RichTextContainer, .RichContent-inner, .ContentItem', { 
      timeout: 10000 
    }).catch(() => {});

    // 判断是文章还是回答
    const isArticle = url.includes('/p/');
    const isAnswer = url.includes('/answer/');

    if (isArticle) {
      return this.extractArticle(page);
    } else if (isAnswer) {
      return this.extractAnswer(page);
    }
    
    return this.extractGeneric(page);
  }

  /** 提取视频 URL */
  private async extractVideos(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const videos: string[] = [];
      
      // 1. video 标签
      document.querySelectorAll('video').forEach(video => {
        const src = video.src || video.getAttribute('data-src') || '';
        if (src) videos.push(src);
      });
      
      // 2. source 标签
      document.querySelectorAll('video source').forEach(source => {
        const src = source.getAttribute('src') || '';
        if (src) videos.push(src);
      });
      
      // 3. 知乎视频播放器
      document.querySelectorAll('[data-video]').forEach(el => {
        const videoUrl = el.getAttribute('data-video') || '';
        if (videoUrl) videos.push(videoUrl);
      });
      
      // 4. 从页面数据中提取
      const pageContent = document.body.innerHTML;
      const patterns = [
        /"play_url"\s*:\s*"([^"]+)"/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"playUrl"\s*:\s*"([^"]+)"/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(pageContent)) !== null) {
          const url = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          if (url) videos.push(url);
        }
      }
      
      return [...new Set(videos)].slice(0, 10);
    }).catch(() => []);
  }

  private async extractArticle(page: Page): Promise<Partial<CrawlResult>> {
    const title = await page.$eval(
      'h1.Post-Title, .Post-Title',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const author = await page.$eval(
      '.AuthorInfo-name, .UserLink-link',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const content = await page.$eval(
      '.Post-RichTextContainer, .RichText',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const images = await page.$$eval(
      '.Post-RichTextContainer img, .RichText img',
      (imgs: Element[]) => imgs.map(img => img.getAttribute('src') || img.getAttribute('data-original') || '').filter(Boolean)
    ).catch(() => []);

    const videos = await this.extractVideos(page);

    const publishedAt = await page.$eval(
      '.ContentItem-time, .Post-Time',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    // 如果标题为空，从页面标题获取
    const pageTitle = title || await page.title();

    return {
      title: cleanText(pageTitle),
      author: cleanText(author),
      content: cleanText(content),
      images,
      videos,
      publishedAt: cleanText(publishedAt),
    };
  }

  private async extractAnswer(page: Page): Promise<Partial<CrawlResult>> {
    // 问题标题
    const title = await page.$eval(
      'h1.QuestionHeader-title, .QuestionHeader-title',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    // 回答者
    const author = await page.$eval(
      '.AuthorInfo-name, .AnswerItem .UserLink-link',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    // 回答内容 - 尝试多个选择器
    let content = await page.$eval(
      '.RichContent-inner .RichText',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    if (!content) {
      content = await page.$eval(
        '.AnswerItem .RichContent-inner',
        (el: Element) => el.textContent || ''
      ).catch(() => '');
    }

    if (!content) {
      content = await page.$eval(
        '[class*="RichContent"] [class*="RichText"]',
        (el: Element) => el.textContent || ''
      ).catch(() => '');
    }

    // 图片
    const images = await page.$$eval(
      '.RichContent-inner img',
      (imgs: Element[]) => imgs.map(img => img.getAttribute('src') || img.getAttribute('data-original') || '').filter(Boolean)
    ).catch(() => []);

    // 视频
    const videos = await this.extractVideos(page);

    // 回答时间
    const publishedAt = await page.$eval(
      '.ContentItem-time span, .AnswerItem-time',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const pageTitle = title || await page.title();

    return {
      title: cleanText(pageTitle),
      author: cleanText(author),
      content: cleanText(content),
      images,
      videos,
      publishedAt: cleanText(publishedAt),
    };
  }

  private async extractGeneric(page: Page): Promise<Partial<CrawlResult>> {
    const title = await page.title();
    const content = await page.$eval(
      'body',
      (el: Element) => el.textContent || ''
    ).catch(() => '');

    const videos = await this.extractVideos(page);

    return {
      title,
      content: cleanText(content).slice(0, 5000),
      images: [],
      videos,
    };
  }
}
