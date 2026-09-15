import logging
from typing import List, Dict, Any
from duckduckgo_search import DDGS
from services.ingestion.website_ingester import website_ingester

logger = logging.getLogger(__name__)

class WebSearchIngester:
    def __init__(self, max_results: int = 5):
        self.max_results = max_results

    async def search_and_extract(self, query: str, crawl_pages: bool = True) -> List[Dict[str, Any]]:
        results = []
        logger.info(f"Executing web search for: '{query}' (crawl_pages={crawl_pages})")

        search_hits = []
        try:
            with DDGS() as ddgs:
                raw_hits = list(ddgs.text(query, max_results=self.max_results))
                for hit in raw_hits:
                    search_hits.append({
                        "title": hit.get("title", ""),
                        "url": hit.get("href", ""),
                        "snippet": hit.get("body", "")
                    })
        except Exception as e:
            logger.error(f"Error executing DuckDuckGo search for '{query}': {e}")
            return []

        # Add search results overview chunk
        overview_lines = [f"Web Search Query: {query}", "Top Results:"]
        for idx, hit in enumerate(search_hits, start=1):
            overview_lines.append(f"{idx}. {hit['title']} - {hit['url']}\n   Snippet: {hit['snippet']}")

        results.append({
            "chunk_index": 1,
            "text": "\n\n".join(overview_lines),
            "metadata": {
                "query": query,
                "type": "websearch_summary",
                "results_count": len(search_hits)
            }
        })

        # If crawl_pages is True, scrape the top 2-3 links
        if crawl_pages:
            for hit in search_hits[:3]:
                url = hit.get("url")
                if not url:
                    continue
                try:
                    page_chunks = await website_ingester.extract_url(url)
                    for chunk in page_chunks:
                        chunk["metadata"]["search_query"] = query
                        results.append(chunk)
                except Exception as crawl_err:
                    logger.warning(f"Could not scrape search result URL {url}: {crawl_err}")

        return results

websearch_ingester = WebSearchIngester()
