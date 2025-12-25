import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getCrawler } from './crawlers/index.js';
import { detectPlatform } from './utils.js';
import type { CrawlRequest, ApiResponse, CrawlResult } from './types.js';

const fastify = Fastify({
  logger: true,
});

// 启用 CORS
await fastify.register(cors, {
  origin: true,
});

/** 健康检查 */
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

/** 爬取接口 */
fastify.post<{ Body: CrawlRequest }>('/crawl', async (request, reply) => {
  const { url, timeout = 30000, cookies } = request.body;

  if (!url) {
    return reply.status(400).send({
      code: 400,
      message: 'URL is required',
    } satisfies ApiResponse<null>);
  }

  // 验证 URL 格式
  try {
    new URL(url);
  } catch {
    return reply.status(400).send({
      code: 400,
      message: 'Invalid URL format',
    } satisfies ApiResponse<null>);
  }

  try {
    const platform = detectPlatform(url);
    const crawler = getCrawler(platform);
    
    fastify.log.info({ url, platform, hasCookies: !!cookies }, 'Starting crawl');
    
    const result = await crawler.crawl(url, { timeout, cookies });
    
    if (result.success) {
      return {
        code: 200,
        message: 'Success',
        data: result,
      } satisfies ApiResponse<CrawlResult>;
    } else {
      return {
        code: 500,
        message: result.error || 'Crawl failed',
        data: result,
      } satisfies ApiResponse<CrawlResult>;
    }
  } catch (error) {
    fastify.log.error({ error, url }, 'Crawl error');
    return reply.status(500).send({
      code: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
    } satisfies ApiResponse<null>);
  }
});

/** 批量爬取接口 */
fastify.post<{ Body: { urls: string[]; timeout?: number; cookies?: CrawlRequest['cookies'] } }>('/crawl/batch', async (request, reply) => {
  const { urls, timeout = 30000, cookies } = request.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return reply.status(400).send({
      code: 400,
      message: 'URLs array is required',
    } satisfies ApiResponse<null>);
  }

  if (urls.length > 10) {
    return reply.status(400).send({
      code: 400,
      message: 'Maximum 10 URLs per batch',
    } satisfies ApiResponse<null>);
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const platform = detectPlatform(url);
        const crawler = getCrawler(platform);
        return await crawler.crawl(url, { timeout, cookies });
      } catch (error) {
        return {
          success: false,
          platform: 'unknown' as const,
          url,
          title: '',
          content: '',
          images: [],
          videos: [],
          crawledAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  return {
    code: 200,
    message: 'Success',
    data: results,
  } satisfies ApiResponse<CrawlResult[]>;
});

// 启动服务器
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Content Mirror API running at http://localhost:${port}`);
    console.log(`📚 Endpoints:`);
    console.log(`   POST /crawl - Crawl a single URL (supports cookies)`);
    console.log(`   POST /crawl/batch - Crawl multiple URLs (max 10)`);
    console.log(`   GET  /health - Health check`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
