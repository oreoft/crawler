/** 爬取结果 */
export interface CrawlResult {
  success: boolean;
  platform: Platform;
  url: string;
  title: string;
  author?: string;
  content: string;
  images: string[];
  videos: string[];
  publishedAt?: string;
  crawledAt: string;
  error?: string;
}

/** 支持的平台 */
export type Platform = 'zhihu' | 'xiaohongshu' | 'twitter' | 'wechat' | 'unknown';

/** Cookie 配置 */
export interface CookieParam {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/** 爬取请求 */
export interface CrawlRequest {
  url: string;
  timeout?: number; // 超时时间，默认 30s
  cookies?: CookieParam[] | string; // 支持数组或字符串格式
}

/** API 响应 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

