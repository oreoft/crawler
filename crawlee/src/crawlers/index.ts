import type { Platform } from '../types.js';
import type { BaseCrawler } from './base.js';
import { ZhihuCrawler } from './zhihu.js';
import { XiaohongshuCrawler } from './xiaohongshu.js';
import { TwitterCrawler } from './twitter.js';
import { WechatCrawler } from './wechat.js';
import { GenericCrawler } from './generic.js';

/** 获取对应平台的爬虫实例 */
export function getCrawler(platform: Platform): BaseCrawler {
  switch (platform) {
    case 'zhihu':
      return new ZhihuCrawler();
    case 'xiaohongshu':
      return new XiaohongshuCrawler();
    case 'twitter':
      return new TwitterCrawler();
    case 'wechat':
      return new WechatCrawler();
    default:
      return new GenericCrawler();
  }
}

export { BaseCrawler } from './base.js';
export { ZhihuCrawler } from './zhihu.js';
export { XiaohongshuCrawler } from './xiaohongshu.js';
export { TwitterCrawler } from './twitter.js';
export { WechatCrawler } from './wechat.js';
export { GenericCrawler } from './generic.js';

