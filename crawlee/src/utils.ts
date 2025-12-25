import type { Platform, CookieParam } from './types.js';

/** 根据 URL 判断平台 */
export function detectPlatform(url: string): Platform {
  const host = new URL(url).hostname.toLowerCase();
  
  if (host.includes('zhihu.com')) return 'zhihu';
  if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) return 'xiaohongshu';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('weixin.qq.com') || host.includes('mp.weixin.qq.com')) return 'wechat';
  
  return 'unknown';
}

/** 清理文本内容 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/** 获取当前时间 ISO 格式 */
export function nowISO(): string {
  return new Date().toISOString();
}

/** 解析 cookie 字符串为数组格式 */
export function parseCookies(cookies: CookieParam[] | string | undefined, domain: string): CookieParam[] {
  if (!cookies) return [];
  
  // 如果已经是数组，直接返回
  if (Array.isArray(cookies)) {
    return cookies.map(c => ({ ...c, domain: c.domain || domain }));
  }
  
  // 解析字符串格式: "name1=value1; name2=value2"
  return cookies.split(';').map(pair => {
    const [name, ...valueParts] = pair.trim().split('=');
    return {
      name: name.trim(),
      value: valueParts.join('=').trim(),
      domain,
    };
  }).filter(c => c.name && c.value);
}

