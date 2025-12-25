import type { Page } from 'playwright';
import type { CrawlResult } from '../types.js';
import { cleanText } from '../utils.js';
import { BaseCrawler } from './base.js';

/** 小红书爬虫 */
export class XiaohongshuCrawler extends BaseCrawler {
  platform = 'xiaohongshu' as const;

  protected getDomain(): string {
    return '.xiaohongshu.com';
  }

  async extract(page: Page): Promise<Partial<CrawlResult>> {
    try {
      // 等待页面加载
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      
      // 尝试关闭可能的弹窗
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);

      // 检查页面标题判断是否加载成功
      const pageTitle = await page.title();
      if (pageTitle.includes('登录') && !pageTitle.includes(' - 小红书')) {
        return {
          title: '',
          content: '',
          images: [],
          videos: [],
        };
      }

      // 从页面标题提取笔记标题（格式：标题 - 小红书）
      let title = '';
      if (pageTitle.includes(' - 小红书')) {
        title = pageTitle.replace(' - 小红书', '');
      }

      // 作者名 - 通过链接文本获取
      const author = await page.evaluate(() => {
        // 查找作者链接（排除"我"这种登录用户的自我标识）
        const authorLinks = document.querySelectorAll('a[href*="/user/profile/"]');
        for (const link of authorLinks) {
          const text = link.textContent?.trim();
          // 过滤掉空的、太长的、"我"、以及其他非作者名的内容
          if (text && text.length > 1 && text.length < 50 && 
              text !== '我' && !text.includes('http')) {
            return text;
          }
        }
        return '';
      }).catch(() => '');

      // 内容 - 获取笔记正文
      const content = await page.evaluate(() => {
        // 方法1: 查找包含 # 标签链接的父容器
        const hashtagLinks = document.querySelectorAll('a[href*="/search_result?keyword="]');
        if (hashtagLinks.length > 0) {
          const parent = hashtagLinks[0].parentElement;
          if (parent) {
            return parent.textContent || '';
          }
        }
        
        // 方法2: 查找包含 emoji 表情的文本块
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const text = div.textContent || '';
          // 笔记内容通常较长且包含特定模式
          if (text.length > 50 && text.length < 5000 && 
              (text.includes('#') || text.includes('[') || text.includes('。'))) {
            // 检查是否是主要内容区域（不是页脚等）
            if (!text.includes('沪ICP备') && !text.includes('营业执照')) {
              return text;
            }
          }
        }
        
        return '';
      }).catch(() => '');

      // 获取笔记图片 - 从多个来源提取
      const images = await page.evaluate(() => {
        const imgs: string[] = [];
        
        // 方法1: 从 img 标签获取
        const imgElements = document.querySelectorAll('img');
        for (const img of imgElements) {
          const src = img.src || img.getAttribute('data-src') || '';
          // 只要真正的图片：webpic 或 sns-webpic
          if (src.includes('xhscdn.com') && 
              (src.includes('webpic') || src.includes('sns-webpic')) &&
              !src.includes('avatar') && 
              !src.includes('icon') &&
              !src.includes('logo') &&
              !src.includes('.js') &&
              !src.includes('fe-static')) {
            const cleanSrc = src.split('?')[0];
            if (!imgs.includes(cleanSrc)) {
              imgs.push(cleanSrc);
            }
          }
        }
        
        // 方法2: 从页面 JSON 数据中提取
        const pageContent = document.body.innerHTML;
        const patterns = [
          /"imageList"\s*:\s*\[([^\]]+)\]/g,
          /"urlDefault"\s*:\s*"([^"]+)"/g,
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(pageContent)) !== null) {
            const content = match[1];
            // 从 JSON 数组中提取 URL
            const urlMatches = content.match(/"[^"]*(?:webpic|sns-webpic)[^"]*xhscdn[^"]+"/g);
            if (urlMatches) {
              for (const urlMatch of urlMatches) {
                const url = urlMatch.replace(/"/g, '').replace(/\\u002F/g, '/').split('?')[0];
                if (url && !imgs.includes(url) && !url.includes('avatar') && !url.includes('.js')) {
                  imgs.push(url);
                }
              }
            }
          }
        }
        
        return imgs.slice(0, 20);
      }).catch(() => []);

      // 获取视频
      const videos = await page.evaluate(() => {
        const vids: string[] = [];
        
        // 辅助函数：检查是否是有效的视频链接
        const isValidVideo = (url: string) => {
          if (!url || url.startsWith('blob:')) return false;
          return url.includes('sns-video') || url.includes('.mp4') || url.includes('stream');
        };
        
        // 1. video 标签
        document.querySelectorAll('video').forEach(video => {
          const src = video.src || video.getAttribute('data-src') || '';
          if (isValidVideo(src) && !vids.includes(src)) vids.push(src);
        });
        
        // 2. source 标签
        document.querySelectorAll('video source').forEach(source => {
          const src = source.getAttribute('src') || '';
          if (isValidVideo(src) && !vids.includes(src)) vids.push(src);
        });
        
        // 3. 从页面 JSON 数据中提取视频 URL
        const pageContent = document.body.innerHTML;
        const patterns = [
          /"masterUrl"\s*:\s*"([^"]+)"/g,
          /"videoUrl"\s*:\s*"([^"]+)"/g,
          /"url"\s*:\s*"([^"]*sns-video[^"]+)"/g,
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(pageContent)) !== null) {
            let url = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            // 处理相对路径
            if (url.startsWith('//')) {
              url = 'https:' + url;
            }
            if (isValidVideo(url) && !vids.includes(url)) {
              vids.push(url);
            }
          }
        }
        
        return vids.slice(0, 10);
      }).catch(() => []);

      // 发布时间
      const publishedAt = await page.evaluate(() => {
        const timePatterns = ['编辑于', '发布于', '天前', '小时前', '分钟前'];
        const allText = document.body.innerText;
        for (const pattern of timePatterns) {
          const index = allText.indexOf(pattern);
          if (index !== -1) {
            // 提取时间相关的文本
            const start = Math.max(0, index - 10);
            const end = Math.min(allText.length, index + 20);
            const timeText = allText.substring(start, end).trim();
            // 只返回包含时间信息的部分
            const match = timeText.match(/(\d+天前|\d+小时前|\d+分钟前|编辑于.+?(?:\s|$)|发布于.+?(?:\s|$))/);
            if (match) {
              return match[0].trim();
            }
          }
        }
        return '';
      }).catch(() => '');

      return {
        title: cleanText(title),
        author: cleanText(author),
        content: cleanText(content),
        images,
        videos,
        publishedAt: cleanText(publishedAt),
      };
    } catch (error) {
      return {
        title: '',
        content: '',
        images: [],
        videos: [],
      };
    }
  }
}
