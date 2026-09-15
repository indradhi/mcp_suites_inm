import os
import logging
from typing import List, Dict, Any
from docx import Document

logger = logging.getLogger(__name__)

class WordIngester:
    def extract_text(self, file_path: str) -> List[Dict[str, Any]]:
        results = []
        try:
            doc = Document(file_path)
            paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

            # Also extract table text
            table_texts = []
            for t_idx, table in enumerate(doc.tables):
                for r_idx, row in enumerate(table.rows):
                    row_data = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_data:
                        table_texts.append(f"Table {t_idx+1} Row: " + " | ".join(row_data))

            all_sections = paragraphs + table_texts

            # Group into chunks of ~1000 characters
            current_chunk = []
            current_len = 0
            chunk_idx = 1

            for line in all_sections:
                if current_len + len(line) > 1200 and current_chunk:
                    results.append({
                        "chunk_index": chunk_idx,
                        "text": "\n".join(current_chunk),
                        "metadata": {
                            "source_file": os.path.basename(file_path),
                            "chunk_index": chunk_idx
                        }
                    })
                    chunk_idx += 1
                    current_chunk = [line]
                    current_len = len(line)
                else:
                    current_chunk.append(line)
                    current_len += len(line)

            if current_chunk:
                results.append({
                    "chunk_index": chunk_idx,
                    "text": "\n".join(current_chunk),
                    "metadata": {
                        "source_file": os.path.basename(file_path),
                        "chunk_index": chunk_idx
                    }
                })

        except Exception as e:
            logger.error(f"Error reading Word document {file_path}: {e}")
            raise

        return results

word_ingester = WordIngester()
