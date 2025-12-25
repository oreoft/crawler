"""Type definitions for the content mirror service."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Platform(str, Enum):
    """Supported platforms."""
    ZHIHU = "zhihu"
    XIAOHONGSHU = "xiaohongshu"
    TWITTER = "twitter"
    WECHAT = "wechat"
    UNKNOWN = "unknown"


class CookieParam(BaseModel):
    """Cookie parameter."""
    name: str
    value: str
    domain: Optional[str] = None
    path: Optional[str] = "/"


class CrawlRequest(BaseModel):
    """Crawl request model."""
    url: str
    timeout: int = Field(default=30000, description="Timeout in milliseconds")
    cookies: Optional[str | list[CookieParam]] = None


class CrawlResult(BaseModel):
    """Crawl result model."""
    success: bool
    platform: Platform
    url: str
    title: str = ""
    author: Optional[str] = None
    content: str = ""
    images: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    published_at: Optional[str] = None
    crawled_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None


class ApiResponse(BaseModel):
    """API response wrapper."""
    code: int
    message: str
    data: Optional[CrawlResult | list[CrawlResult]] = None

