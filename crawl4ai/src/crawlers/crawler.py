"""Core crawler using crawl4ai."""

from datetime import datetime
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

from .types import CrawlResult, Platform, CookieParam
from .utils import detect_platform, parse_cookies, get_domain
from .extractors import get_extractor


class ContentCrawler:
    """Content crawler using crawl4ai."""
    
    async def crawl(
        self,
        url: str,
        timeout: int = 30000,
        cookies: str | list[CookieParam] | None = None,
    ) -> CrawlResult:
        """Crawl a URL and extract content."""
        platform = detect_platform(url)
        domain = get_domain(platform)
        parsed_cookies = parse_cookies(cookies, domain)
        
        try:
            # 构建 browser config，直接传入 cookies
            browser_config = BrowserConfig(
                browser_type="chromium",
                headless=True,
                verbose=False,
                viewport_width=1920,
                viewport_height=1080,
                cookies=parsed_cookies if parsed_cookies else None,
                headers={
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                },
                extra_args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
            
            run_config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=timeout,
                wait_until="domcontentloaded",
                delay_before_return_html=3.0,  # Wait for dynamic content
                magic=True,  # Enable anti-detection
            )
            
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=run_config)
                
                if not result.success:
                    return CrawlResult(
                        success=False,
                        platform=platform,
                        url=url,
                        error=result.error_message or "Crawl failed",
                        crawled_at=datetime.now().isoformat(),
                    )
                
                # Extract content using platform-specific extractor
                extractor = get_extractor(platform)
                extracted = extractor.extract(result)
                
                return CrawlResult(
                    success=True,
                    platform=platform,
                    url=url,
                    title=extracted.get("title", ""),
                    author=extracted.get("author"),
                    content=extracted.get("content", ""),
                    images=extracted.get("images", []),
                    videos=extracted.get("videos", []),
                    published_at=extracted.get("published_at"),
                    crawled_at=datetime.now().isoformat(),
                )
                
        except Exception as e:
            return CrawlResult(
                success=False,
                platform=platform,
                url=url,
                error=str(e),
                crawled_at=datetime.now().isoformat(),
            )
    
    async def crawl_batch(
        self,
        urls: list[str],
        timeout: int = 30000,
        cookies: str | list[CookieParam] | None = None,
    ) -> list[CrawlResult]:
        """Crawl multiple URLs."""
        results = []
        for url in urls:
            result = await self.crawl(url, timeout, cookies)
            results.append(result)
        return results
