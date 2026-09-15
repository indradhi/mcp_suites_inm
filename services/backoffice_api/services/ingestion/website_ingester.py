import logging
from typing import List, Dict, Any
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class WebsiteIngester:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    async def extract_url(self, url: str) -> List[Dict[str, Any]]:
        results = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Remove unwanted elements
            for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "aside", "svg"]):
                tag.decompose()

            title = soup.title.string.strip() if soup.title and soup.title.string else url

            # Extract main content
            main_content = soup.find("main") or soup.find("article") or soup.body
            if not main_content:
                return []

            paragraphs = [p.get_text(separator=" ", strip=True) for p in main_content.find_all(["p", "h1", "h2", "h3", "h4", "li"])]
            paragraphs = [p for p in paragraphs if len(p) > 20]

            # Chunk into segments
            current_chunk = []
            current_len = 0
            chunk_idx = 1

            for p in paragraphs:
                if current_len + len(p) > 1200 and current_chunk:
                    results.append({
                        "chunk_index": chunk_idx,
                        "text": f"Source URL: {url}\nTitle: {title}\n\n" + "\n\n".join(current_chunk),
                        "metadata": {
                            "source_url": url,
                            "page_title": title,
                            "chunk_index": chunk_idx
                        }
                    })
                    chunk_idx += 1
                    current_chunk = [p]
                    current_len = len(p)
                else:
                    current_chunk.append(p)
                    current_len += len(p)

            if current_chunk:
                results.append({
                    "chunk_index": chunk_idx,
                    "text": f"Source URL: {url}\nTitle: {title}\n\n" + "\n\n".join(current_chunk),
                    "metadata": {
                        "source_url": url,
                        "page_title": title,
                        "chunk_index": chunk_idx
                    }
                })

        except Exception as e:
            logger.error(f"Error scraping website {url}: {e}")
            raise

        return results

website_ingester = WebsiteIngester()
