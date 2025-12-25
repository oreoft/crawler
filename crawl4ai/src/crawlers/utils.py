"""Utility functions."""

import re
from urllib.parse import urlparse
from .types import Platform, CookieParam


def detect_platform(url: str) -> Platform:
    """Detect platform from URL."""
    try:
        host = urlparse(url).hostname or ""
        host = host.lower()
        
        if "zhihu.com" in host:
            return Platform.ZHIHU
        if "xiaohongshu.com" in host or "xhslink.com" in host:
            return Platform.XIAOHONGSHU
        if "twitter.com" in host or "x.com" in host:
            return Platform.TWITTER
        if "weixin.qq.com" in host or "mp.weixin.qq.com" in host:
            return Platform.WECHAT
        
        return Platform.UNKNOWN
    except Exception:
        return Platform.UNKNOWN


def clean_text(text: str) -> str:
    """Clean text content."""
    if not text:
        return ""
    # Replace multiple spaces with single space
    text = re.sub(r'\s+', ' ', text)
    # Replace multiple newlines with single newline
    text = re.sub(r'\n\s*\n', '\n', text)
    return text.strip()


def parse_cookies(cookies: str | list[CookieParam] | None, domain: str) -> list[dict]:
    """Parse cookies to crawl4ai format."""
    if not cookies:
        return []
    
    result = []
    
    if isinstance(cookies, list):
        for c in cookies:
            result.append({
                "name": c.name,
                "value": c.value,
                "domain": c.domain or domain,
                "path": c.path or "/",
            })
    else:
        # Parse string format: "name1=value1; name2=value2"
        for pair in cookies.split(";"):
            pair = pair.strip()
            if "=" in pair:
                name, value = pair.split("=", 1)
                result.append({
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": domain,
                    "path": "/",
                })
    
    return result


def get_domain(platform: Platform) -> str:
    """Get domain for platform."""
    domains = {
        Platform.ZHIHU: ".zhihu.com",
        Platform.XIAOHONGSHU: ".xiaohongshu.com",
        Platform.TWITTER: ".x.com",
        Platform.WECHAT: ".qq.com",
        Platform.UNKNOWN: "",
    }
    return domains.get(platform, "")

