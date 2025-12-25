"""FastAPI server for content mirror service."""

import os
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .types import CrawlRequest, CrawlResult, ApiResponse, CookieParam
from .crawler import ContentCrawler


# Global crawler instance
crawler: ContentCrawler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    global crawler
    crawler = ContentCrawler()
    print("🚀 Content Mirror API (crawl4ai) running")
    print("📚 Endpoints:")
    print("   POST /crawl - Crawl a single URL (supports cookies)")
    print("   POST /crawl/batch - Crawl multiple URLs (max 10)")
    print("   GET  /health - Health check")
    yield
    # Cleanup
    crawler = None


app = FastAPI(
    title="Content Mirror API",
    description="A content mirroring service using crawl4ai",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/crawl", response_model=ApiResponse)
async def crawl_url(request: CrawlRequest):
    """Crawl a single URL."""
    if not crawler:
        raise HTTPException(status_code=500, detail="Crawler not initialized")
    
    if not request.url:
        return ApiResponse(code=400, message="URL is required")
    
    # Validate URL format
    try:
        from urllib.parse import urlparse
        parsed = urlparse(request.url)
        if not parsed.scheme or not parsed.netloc:
            return ApiResponse(code=400, message="Invalid URL format")
    except Exception:
        return ApiResponse(code=400, message="Invalid URL format")
    
    result = await crawler.crawl(
        url=request.url,
        timeout=request.timeout,
        cookies=request.cookies,
    )
    
    if result.success:
        return ApiResponse(code=200, message="Success", data=result)
    else:
        return ApiResponse(code=500, message=result.error or "Crawl failed", data=result)


class BatchCrawlRequest(BaseModel):
    """Batch crawl request."""
    urls: list[str]
    timeout: int = 30000
    cookies: str | list[CookieParam] | None = None


@app.post("/crawl/batch", response_model=ApiResponse)
async def crawl_batch(request: BatchCrawlRequest):
    """Crawl multiple URLs."""
    if not crawler:
        raise HTTPException(status_code=500, detail="Crawler not initialized")
    
    if not request.urls or len(request.urls) == 0:
        return ApiResponse(code=400, message="URLs array is required")
    
    if len(request.urls) > 10:
        return ApiResponse(code=400, message="Maximum 10 URLs per batch")
    
    results = await crawler.crawl_batch(
        urls=request.urls,
        timeout=request.timeout,
        cookies=request.cookies,
    )
    
    return ApiResponse(code=200, message="Success", data=results)


def create_app() -> FastAPI:
    """Create and return the FastAPI app."""
    return app

