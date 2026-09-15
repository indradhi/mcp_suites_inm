import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class TextIngester:
    def extract_text(self, file_path: str, chunk_size: int = 1200) -> List[Dict[str, Any]]:
        results = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]

            current_chunk = []
            current_len = 0
            chunk_idx = 1

            for p in paragraphs:
                if current_len + len(p) > chunk_size and current_chunk:
                    results.append({
                        "chunk_index": chunk_idx,
                        "text": "\n\n".join(current_chunk),
                        "metadata": {
                            "source_file": os.path.basename(file_path),
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
                    "text": "\n\n".join(current_chunk),
                    "metadata": {
                        "source_file": os.path.basename(file_path),
                        "chunk_index": chunk_idx
                    }
                })

        except Exception as e:
            logger.error(f"Error reading text file {file_path}: {e}")
            raise

        return results

text_ingester = TextIngester()
