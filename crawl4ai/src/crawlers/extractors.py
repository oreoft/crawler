"""Platform-specific content extractors."""

import re
from abc import ABC, abstractmethod
from .types import Platform
from .utils import clean_text


class BaseExtractor(ABC):
    """Base extractor class."""
    
    @property
    @abstractmethod
    def platform(self) -> Platform:
        pass
    
    @abstractmethod
    def extract(self, result) -> dict:
        """Extract content from crawl result."""
        pass
    
    def get_page_title(self, html: str) -> str:
        """Extract page title from HTML."""
        match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
        return clean_text(match.group(1)) if match else ""
    
    def extract_videos_generic(self, html: str) -> list[str]:
        """Extract video URLs from HTML - generic method."""
        videos = []
        
        # 1. <video> 标签的 src
        video_src = re.findall(r'<video[^>]*src="([^"]+)"', html, re.IGNORECASE)
        videos.extend(video_src)
        
        # 2. <source> 标签的 src (在 video 内)
        source_src = re.findall(r'<source[^>]*src="([^"]+)"[^>]*type="video', html, re.IGNORECASE)
        videos.extend(source_src)
        
        # 3. data-src 属性的视频
        data_video = re.findall(r'data-(?:video-)?src="([^"]+\.(?:mp4|m3u8|webm)[^"]*)"', html, re.IGNORECASE)
        videos.extend(data_video)
        
        # 4. JSON 中的视频 URL
        json_video = re.findall(r'"(?:video_?url|videoUrl|video_src|stream_url|playUrl)"\s*:\s*"([^"]+)"', html)
        videos.extend(json_video)
        
        # 清理和去重，过滤 blob: URL
        clean_videos = []
        for v in videos:
            v = v.replace('\\u002F', '/').replace('\\/', '/')
            if v and v not in clean_videos and not v.startswith('blob:'):
                clean_videos.append(v)
        
        return clean_videos[:10]


class ZhihuExtractor(BaseExtractor):
    """Zhihu content extractor."""
    
    @property
    def platform(self) -> Platform:
        return Platform.ZHIHU
    
    def extract(self, result) -> dict:
        """Extract zhihu article/answer content."""
        html = result.html or ""
        markdown = result.markdown or ""
        
        title = ""
        author = ""
        content = clean_text(markdown) if markdown else ""
        images = []
        videos = []
        published_at = ""
        
        # Extract title
        title_patterns = [
            r'<h1[^>]*class="[^"]*Post-Title[^"]*"[^>]*>([^<]+)</h1>',
            r'<h1[^>]*class="[^"]*QuestionHeader-title[^"]*"[^>]*>([^<]+)</h1>',
            r'"title"\s*:\s*"([^"]+)"',
        ]
        for pattern in title_patterns:
            match = re.search(pattern, html)
            if match:
                title = clean_text(match.group(1))
                break
        
        if not title:
            page_title = self.get_page_title(html)
            if page_title and " - 知乎" in page_title:
                title = page_title.replace(" - 知乎", "")
        
        # Extract author
        author_patterns = [
            r'class="[^"]*AuthorInfo-name[^"]*"[^>]*>([^<]+)<',
            r'"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"',
        ]
        for pattern in author_patterns:
            match = re.search(pattern, html)
            if match:
                author = clean_text(match.group(1))
                break
        
        # Extract images
        img_matches = re.findall(r'(?:src|data-original)="([^"]+)"', html)
        images = [img for img in img_matches if 'zhimg.com' in img or 'pic' in img]
        images = list(set(images))[:20]
        
        # Extract videos - 知乎视频
        video_patterns = [
            r'"play_url"\s*:\s*"([^"]+)"',
            r'"video_url"\s*:\s*"([^"]+)"',
            r'data-video="([^"]+)"',
            r'class="[^"]*VideoCard[^"]*"[^>]*data-url="([^"]+)"',
        ]
        for pattern in video_patterns:
            matches = re.findall(pattern, html)
            videos.extend(matches)
        videos.extend(self.extract_videos_generic(html))
        videos = list(set(videos))[:10]
        
        return {
            "title": title,
            "author": author,
            "content": content[:10000],
            "images": images,
            "videos": videos,
            "published_at": published_at,
        }


class XiaohongshuExtractor(BaseExtractor):
    """Xiaohongshu content extractor."""
    
    @property
    def platform(self) -> Platform:
        return Platform.XIAOHONGSHU
    
    def _is_valid_image(self, url: str) -> bool:
        """检查是否是有效的图片URL"""
        invalid_keywords = ['avatar', 'icon', 'logo', '.js', '.css', 'fe-static', 'formula-static', 'fe-video', 'html2canvas']
        url_lower = url.lower()
        if any(kw in url_lower for kw in invalid_keywords):
            return False
        valid_keywords = ['webpic', 'sns-webpic', 'img.xhscdn']
        return any(kw in url_lower for kw in valid_keywords)
    
    def extract(self, result) -> dict:
        """Extract xiaohongshu note content."""
        html = result.html or ""
        markdown = getattr(result, 'fit_markdown', None) or result.markdown or ""
        
        title = ""
        author = ""
        content = ""
        images = []
        videos = []
        published_at = ""
        
        # 1. 从页面标题提取笔记标题
        page_title = self.get_page_title(html)
        if page_title:
            if " - 小红书" in page_title:
                title = page_title.replace(" - 小红书", "").strip()
            elif "小红书" not in page_title and "登录" not in page_title:
                title = page_title
        
        # 2. 从 meta og:title 提取
        if not title:
            meta_match = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"', html)
            if not meta_match:
                meta_match = re.search(r'<meta[^>]*content="([^"]+)"[^>]*property="og:title"', html)
            if meta_match:
                title = clean_text(meta_match.group(1))
        
        # ========== 修复：提取笔记作者（不是评论者）==========
        # 策略1: 从整个 HTML 中搜索，但过滤评论区的 nickname
        
        # 定位评论区位置
        comments_pos = html.find('"comments"')
        
        # 查找所有 nickname 及其位置
        invalid_names = ['登录', '关注', 'http', '小红书', '发现', '通知', '我', 'null', '评论', 'wowo', '分享', '收藏', '首页']
        
        # 方法1: 在 comments 之前的区域搜索
        if comments_pos > 500:
            search_area = html[:comments_pos]
            nickname_matches = re.findall(r'"nickname"\s*:\s*"([^"]{2,50})"', search_area)
            for potential in nickname_matches:
                potential = clean_text(potential)
                if potential and 2 <= len(potential) <= 30:
                    if not any(x in potential.lower() for x in invalid_names):
                        author = potential
                        break
        
        # 方法2: 搜索整个文档，但取第一个有效的
        if not author:
            all_nicknames = re.findall(r'"nickname"\s*:\s*"([^"]{2,50})"', html)
            for potential in all_nicknames:
                potential = clean_text(potential)
                if potential and 2 <= len(potential) <= 30:
                    if not any(x in potential.lower() for x in invalid_names):
                        author = potential
                        break
        
        # 方法3: 从用户链接文本提取
        if not author:
            link_match = re.search(r'/user/profile/[^"]*"[^>]*>([^<]{2,30})</a>', html)
            if link_match:
                potential = clean_text(link_match.group(1))
                if potential and potential not in invalid_names and 2 <= len(potential) <= 30:
                    author = potential
        
        # 提取内容
        content_patterns = [
            r'"desc"\s*:\s*"([^"]{10,5000})"',  # JSON 中的描述
            r'id="detail-desc"[^>]*>([^<]+(?:<[^>]*>[^<]*)*)</[^>]*>',
            r'class="[^"]*desc[^"]*"[^>]*>([^<]+)',
        ]
        for pattern in content_patterns:
            match = re.search(pattern, html, re.DOTALL)
            if match:
                potential_content = match.group(1)
                # 处理 unicode 转义
                potential_content = potential_content.replace('\\n', '\n').replace('\\u002F', '/')
                potential_content = clean_text(re.sub(r'<[^>]+>', ' ', potential_content))
                if len(potential_content) > 20:
                    content = potential_content
                    break
        
        if not content and markdown:
            lines = markdown.split('\n')
            valid_lines = []
            skip_keywords = ['沪ICP备', '营业执照', '违法不良信息', '增值电信', 
                           '创作中心', '业务合作', '发现', '发布', '通知', '登录',
                           '[![', 'http://', 'https://']
            for line in lines:
                line = line.strip()
                if line and len(line) > 5:
                    if not any(kw in line for kw in skip_keywords):
                        valid_lines.append(line)
            content = '\n'.join(valid_lines)
        
        # 提取图片
        img_patterns = [
            r'"imageList"\s*:\s*\[([^\]]+)\]',
            r'"urlDefault"\s*:\s*"([^"]+)"',
            r'"url"\s*:\s*"([^"]*(?:webpic|img)[^"]*xhscdn[^"]+)"',
            r'(?:src|data-src)="([^"]*(?:webpic|sns-webpic)[^"]*xhscdn\.com[^"]+)"',
        ]
        for pattern in img_patterns:
            matches = re.findall(pattern, html)
            for match in matches:
                if 'imageList' in pattern:
                    urls = re.findall(r'"([^"]+xhscdn[^"]+)"', match)
                    for url in urls:
                        clean_url = url.split("?")[0].replace('\\u002F', '/').replace('\\/', '/')
                        if self._is_valid_image(clean_url) and clean_url not in images:
                            images.append(clean_url)
                else:
                    clean_url = match.split("?")[0].replace('\\u002F', '/').replace('\\/', '/')
                    if self._is_valid_image(clean_url) and clean_url not in images:
                        images.append(clean_url)
        
        # 提取视频
        video_patterns = [
            r'"masterUrl"\s*:\s*"([^"]+)"',
            r'"videoUrl"\s*:\s*"([^"]+)"',
            r'"originVideoKey"\s*:\s*"([^"]+)"',
            r'"url"\s*:\s*"([^"]*sns-video[^"]+)"',
            r'video[^>]*src="([^"]+\.mp4[^"]*)"',
        ]
        for pattern in video_patterns:
            matches = re.findall(pattern, html)
            for match in matches:
                video_url = match.replace('\\u002F', '/').replace('\\/', '/')
                if video_url and video_url not in videos and not video_url.startswith('blob:'):
                    if video_url.startswith('//'):
                        video_url = 'https:' + video_url
                    if 'sns-video' in video_url or '.mp4' in video_url:
                        videos.append(video_url)
        
        videos.extend(self.extract_videos_generic(html))
        clean_videos = []
        for v in videos:
            if v not in clean_videos and not v.startswith('blob:') and ('sns-video' in v or '.mp4' in v or 'stream' in v):
                clean_videos.append(v)
        videos = clean_videos[:10]
        
        # 提取时间
        time_match = re.search(r'(编辑于|发布于)?\s*(\d+[天小时分钟]+前)\s*(上海|北京|广州|深圳|杭州)?', html)
        if time_match:
            published_at = clean_text(time_match.group(0))
        
        return {
            "title": title,
            "author": author,
            "content": clean_text(content)[:10000],
            "images": images[:20],
            "videos": videos,
            "published_at": published_at,
        }


class TwitterExtractor(BaseExtractor):
    """Twitter/X content extractor."""
    
    @property
    def platform(self) -> Platform:
        return Platform.TWITTER
    
    def extract(self, result) -> dict:
        """Extract tweet content."""
        html = result.html or ""
        markdown = result.markdown or ""
        
        title = ""
        author = ""
        content = ""
        images = []
        videos = []
        published_at = ""
        
        # 从页面标题提取标题和作者
        page_title = self.get_page_title(html)
        if page_title:
            title = page_title.replace(" / X", "").replace(" on X:", ": ")
            # 从标题中提取作者: "X 上的 用户名："内容""
            author_match = re.search(r'X 上的 ([^：:]+)[：:]', page_title)
            if author_match:
                author = clean_text(author_match.group(1))
            # 备用: 从 @用户名 提取
            if not author:
                at_match = re.search(r'@(\w+)', page_title)
                if at_match:
                    author = f"@{at_match.group(1)}"
        
        # ========== 修复：提取推文正文内容 ==========
        # 方法1: 从标题中提取引号内的内容（最可靠）
        if page_title:
            # 格式: X 上的 用户名："推文内容 https://..."
            quote_match = re.search(r'[：:]\s*["""](.+?)["""]\s*$', page_title)
            if quote_match:
                content = clean_text(quote_match.group(1))
                # 移除末尾的链接
                content = re.sub(r'\s*https?://t\.co/\w+\s*$', '', content)
        
        # 方法2: 从标题提取冒号后的内容
        if not content and page_title:
            colon_match = re.search(r'[：:]\s*(.+)$', page_title)
            if colon_match:
                content = clean_text(colon_match.group(1).strip('"" '))
                content = re.sub(r'\s*https?://t\.co/\w+\s*$', '', content)
        
        # 提取图片
        img_matches = re.findall(r'src="([^"]*pbs\.twimg\.com[^"]+)"', html)
        # 过滤掉头像图片 (_normal, _bigger 等)
        images = [img for img in set(img_matches) if '_normal' not in img and 'profile_images' not in img][:10]
        
        # 提取视频
        video_patterns = [
            r'"video_url"\s*:\s*"([^"]+)"',
            r'"playbackUrl"\s*:\s*"([^"]+)"',
            r'src="([^"]*video\.twimg\.com[^"]+)"',
            r'"variants"\s*:\s*\[[^\]]*"url"\s*:\s*"([^"]+\.mp4[^"]*)"',
            r'"url"\s*:\s*"([^"]*video\.twimg\.com[^"]+\.mp4[^"]*)"',
        ]
        for pattern in video_patterns:
            matches = re.findall(pattern, html)
            for match in matches:
                video_url = match.replace('\\u002F', '/').replace('\\/', '/')
                if video_url and video_url not in videos and not video_url.startswith('blob:'):
                    videos.append(video_url)
        
        videos.extend(self.extract_videos_generic(html))
        clean_videos = [v for v in videos if not v.startswith('blob:')]
        videos = list(set(clean_videos))[:10]
        
        # 提取时间
        time_match = re.search(r'datetime="([^"]+)"', html)
        if time_match:
            published_at = time_match.group(1)
        
        return {
            "title": clean_text(title),
            "author": author,
            "content": content[:5000],
            "images": images,
            "videos": videos,
            "published_at": published_at,
        }


class WechatExtractor(BaseExtractor):
    """WeChat article extractor."""
    
    @property
    def platform(self) -> Platform:
        return Platform.WECHAT
    
    def extract(self, result) -> dict:
        """Extract wechat article content."""
        html = result.html or ""
        markdown = result.markdown or ""
        
        title = ""
        author = ""
        content = clean_text(markdown) if markdown else ""
        images = []
        videos = []
        published_at = ""
        
        # 提取标题
        title_patterns = [
            r'id="activity-name"[^>]*>\s*([^<]+?)\s*<',
            r'class="[^"]*rich_media_title[^"]*"[^>]*>\s*([^<]+?)\s*<',
            r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"',
        ]
        for pattern in title_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                title = clean_text(match.group(1))
                if title:
                    break
        
        # 提取公众号名称
        author_patterns = [
            r'id="js_name"[^>]*>\s*([^<]+?)\s*<',
            r'class="[^"]*profile_nickname[^"]*"[^>]*>\s*([^<]+?)\s*<',
        ]
        for pattern in author_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                author = clean_text(match.group(1))
                if author:
                    break
        
        # 提取图片
        img_matches = re.findall(r'data-src="([^"]+)"', html)
        images = list(set(img_matches))[:30]
        
        # 提取视频
        video_patterns = [
            r'data-src="([^"]+\.mp4[^"]*)"',
            r'"url_info"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"',
            r'<iframe[^>]*class="[^"]*video[^"]*"[^>]*src="([^"]+)"',
            r'data-vidtype="[^"]*"[^>]*data-src="([^"]+)"',
        ]
        for pattern in video_patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            videos.extend(matches)
        
        videos.extend(self.extract_videos_generic(html))
        videos = list(set(videos))[:10]
        
        # 提取发布时间
        time_patterns = [
            r'id="publish_time"[^>]*>\s*([^<]+?)\s*<',
            r'"publish_time"[^>]*>\s*(\d{4}-\d{2}-\d{2})',
        ]
        for pattern in time_patterns:
            match = re.search(pattern, html)
            if match:
                published_at = clean_text(match.group(1))
                break
        
        return {
            "title": title,
            "author": author,
            "content": content[:10000],
            "images": images,
            "videos": videos,
            "published_at": published_at,
        }


class GenericExtractor(BaseExtractor):
    """Generic content extractor for unknown platforms."""
    
    @property
    def platform(self) -> Platform:
        return Platform.UNKNOWN
    
    def extract(self, result) -> dict:
        """Extract generic web content."""
        html = result.html or ""
        markdown = result.markdown or ""
        url = getattr(result, 'url', '') or ''
        
        title = self.get_page_title(html)
        content = ""
        author = None
        images = []
        videos = []
        
        # ========== 修复：GitHub 特殊处理 ==========
        if 'github.com' in url:
            # 从 URL 提取仓库信息
            repo_match = re.search(r'github\.com/([^/]+)/([^/\?\#]+)', url)
            if repo_match:
                owner = repo_match.group(1)
                repo = repo_match.group(2)
                author = owner
                
                # 构建正确的仓库标题
                title = f"GitHub - {owner}/{repo}"
                
                # 从 og:description 获取仓库描述
                og_desc = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]+)"', html)
                if og_desc:
                    desc = clean_text(og_desc.group(1))
                    # 描述通常是 "repo - description"
                    if desc:
                        title = f"GitHub - {owner}/{repo}: {desc[:100]}"
                        content = desc
                
                # 从页面 about 区域获取描述
                if not content:
                    about_patterns = [
                        r'<p[^>]*class="[^"]*f4[^"]*"[^>]*>([^<]+)</p>',
                        r'"description"\s*:\s*"([^"]+)"',
                        r'itemprop="about"[^>]*>([^<]+)<',
                    ]
                    for pattern in about_patterns:
                        match = re.search(pattern, html)
                        if match:
                            content = clean_text(match.group(1))
                            break
                
                # 如果还没有内容，不要使用 markdown（会包含导航等噪音）
                return {
                    "title": title,
                    "author": author,
                    "content": content[:10000] if content else "",
                    "images": images,
                    "videos": videos,
                    "published_at": None,
                }
            else:
                # 用户主页
                og_title = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"', html)
                if og_title:
                    title = clean_text(og_title.group(1))
        
        # 通用处理
        if not content:
            content = clean_text(markdown) if markdown else ""
        
        if not content:
            desc_match = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]+)"', html)
            if desc_match:
                content = clean_text(desc_match.group(1))
        
        # 提取所有图片
        img_matches = re.findall(r'src="(https?://[^"]+\.(jpg|jpeg|png|gif|webp)[^"]*)"', html, re.IGNORECASE)
        images = list(set([img[0].split("?")[0] for img in img_matches]))[:20]
        
        # 提取视频
        videos = self.extract_videos_generic(html)
        
        return {
            "title": title,
            "author": author,
            "content": content[:10000],
            "images": images,
            "videos": videos,
            "published_at": None,
        }


def get_extractor(platform: Platform) -> BaseExtractor:
    """Get extractor for platform."""
    extractors = {
        Platform.ZHIHU: ZhihuExtractor(),
        Platform.XIAOHONGSHU: XiaohongshuExtractor(),
        Platform.TWITTER: TwitterExtractor(),
        Platform.WECHAT: WechatExtractor(),
        Platform.UNKNOWN: GenericExtractor(),
    }
    return extractors.get(platform, GenericExtractor())
