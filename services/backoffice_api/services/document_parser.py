import os
import re
import json
import uuid
import logging
from typing import Dict, Any, Optional, List
import pandas as pd

from services.ingestion.pdf_ingester import pdf_ingester
from services.ingestion.word_ingester import word_ingester
from services.ingestion.excel_ingester import excel_ingester
from services.ingestion.text_ingester import text_ingester

logger = logging.getLogger(__name__)

TEMP_UPLOAD_DIR = "/app/uploads/chat_temp"
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# In-memory fast cache: doc_id -> doc_dict
_DOCUMENT_CACHE: Dict[str, Dict[str, Any]] = {}


class DocumentParserService:
    """
    Service to parse and extract text/tables from user-uploaded files in chat:
    - PDF (.pdf)
    - Word (.docx, .doc)
    - Excel (.xlsx, .xls)
    - CSV / TSV (.csv, .tsv)
    - Text / Markdown / JSON (.txt, .md, .json, .log)
    """

    SUPPORTED_EXTENSIONS = {
        ".pdf": "pdf",
        ".docx": "word",
        ".doc": "word",
        ".xlsx": "excel",
        ".xls": "excel",
        ".csv": "csv",
        ".tsv": "csv",
        ".txt": "text",
        ".md": "text",
        ".json": "text",
        ".log": "text"
    }

    def get_file_type(self, filename: str) -> Optional[str]:
        ext = os.path.splitext(filename.lower())[1]
        return self.SUPPORTED_EXTENSIONS.get(ext)

    def parse_file(self, filename: str, content_or_path: Any) -> Dict[str, Any]:
        """
        Extracts content, metadata, and preview from the given file bytes or file path.
        """
        ext = os.path.splitext(filename.lower())[1]
        file_type = self.SUPPORTED_EXTENSIONS.get(ext)

        if not file_type:
            raise ValueError(
                f"Format file '{ext}' tidak didukung. "
                f"Format yang didukung: PDF, DOCX, XLSX, XLS, CSV, TXT, MD, JSON."
            )

        temp_created = False
        if isinstance(content_or_path, bytes):
            clean_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
            temp_file_path = os.path.join(TEMP_UPLOAD_DIR, f"tmp_{uuid.uuid4().hex[:8]}_{clean_name}")
            with open(temp_file_path, "wb") as f:
                f.write(content_or_path)
            file_path = temp_file_path
            file_size = len(content_or_path)
            temp_created = True
        elif isinstance(content_or_path, str):
            file_path = content_or_path
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        else:
            raise ValueError("content_or_path must be bytes or string path")

        total_pages = None
        total_rows = None
        sheet_names = None
        extracted_content = ""
        summary = ""

        try:
            if file_type == "pdf":
                pdf_chunks = pdf_ingester.extract_text(file_path)
                total_pages = len(pdf_chunks)
                text_parts = []
                for chunk in pdf_chunks:
                    page_num = chunk.get("page", 1)
                    text_parts.append(f"[Halaman {page_num}]\n{chunk.get('text', '')}")
                extracted_content = "\n\n".join(text_parts)
                summary = f"{total_pages} Halaman, {len(extracted_content):,} Karakter"

            elif file_type == "word":
                word_chunks = word_ingester.extract_text(file_path)
                text_parts = [c.get("text", "") for c in word_chunks if c.get("text")]
                extracted_content = "\n\n".join(text_parts)
                summary = f"Dokumen Word, {len(extracted_content):,} Karakter"

            elif file_type == "excel":
                excel_chunks = excel_ingester.extract_text(file_path)
                text_parts = [c.get("text", "") for c in excel_chunks if c.get("text")]
                extracted_content = "\n\n".join(text_parts)

                # Count rows and sheets
                try:
                    xl = pd.ExcelFile(file_path)
                    sheet_names = xl.sheet_names
                    summary = f"Spreadsheet ({len(sheet_names)} Sheet: {', '.join(sheet_names[:3])})"
                except Exception:
                    summary = f"Spreadsheet Excel, {len(text_parts)} Bagian"

            elif file_type == "csv":
                try:
                    sep = "\t" if ext == ".tsv" else ","
                    df = pd.read_csv(file_path, sep=sep, encoding="utf-8", errors="replace")
                    total_rows = len(df)
                    cols = [str(c) for c in df.columns]

                    # Build markdown table preview (first 50 rows) using pure Python
                    header_line = "| " + " | ".join(cols) + " |"
                    sep_line = "| " + " | ".join(["---"] * len(cols)) + " |"
                    row_lines = []
                    for _, r in df.head(50).iterrows():
                        row_cells = [str(r[c]).replace("\n", " ").strip() if pd.notna(r[c]) else "" for c in df.columns]
                        row_lines.append("| " + " | ".join(row_cells) + " |")

                    records_text = [
                        f"Format: CSV/TSV | Kolom: {', '.join(cols)} | Total Baris: {total_rows}",
                        "\n--- PREVIEW TABEL (Maksimal 50 baris pertama) ---",
                        header_line,
                        sep_line
                    ] + row_lines

                    if total_rows > 50:
                        records_text.append(f"\n*(Catatan: Menampilkan 50 dari total {total_rows} baris data)*")

                    extracted_content = "\n".join(records_text)
                    summary = f"Data Tabular ({len(cols)} Kolom, {total_rows:,} Baris)"
                except Exception as csv_err:
                    logger.warning(f"Failed to parse CSV with pandas, fallback to text: {csv_err}")
                    txt_chunks = text_ingester.extract_text(file_path)
                    extracted_content = "\n\n".join(c.get("text", "") for c in txt_chunks)
                    summary = f"File Teks CSV, {len(extracted_content):,} Karakter"

            elif file_type == "text":
                txt_chunks = text_ingester.extract_text(file_path)
                extracted_content = "\n\n".join(c.get("text", "") for c in txt_chunks if c.get("text"))
                summary = f"File Teks, {len(extracted_content):,} Karakter"

        except Exception as e:
            logger.error(f"Error extracting content from {filename}: {e}", exc_info=True)
            raise RuntimeError(f"Gagal membaca isi dokumen '{filename}': {str(e)}")
        finally:
            if temp_created and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

        if not extracted_content.strip():
            extracted_content = "(Dokumen kosong atau teks tidak terbaca)"
            summary = "Dokumen kosong"

        # Generate unique doc_id
        doc_id = str(uuid.uuid4())

        preview = extracted_content[:350].strip()
        if len(extracted_content) > 350:
            preview += "..."

        metadata_dict = {
            "file_name": filename,
            "file_type": file_type,
            "file_size": file_size,
            "summary": summary,
            "total_pages": total_pages,
            "total_rows": total_rows,
            "sheets": sheet_names
        }

        result = {
            "doc_id": doc_id,
            "file_name": filename,
            "file_type": file_type,
            "file_size": file_size,
            "summary": summary,
            "total_pages": total_pages,
            "total_rows": total_rows,
            "sheets": sheet_names,
            "content": extracted_content,
            "text_content": extracted_content,
            "preview": preview,
            "metadata": metadata_dict
        }

        # Cache in-memory and on disk
        _DOCUMENT_CACHE[doc_id] = result
        try:
            cache_file = os.path.join(TEMP_UPLOAD_DIR, f"{doc_id}.json")
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
        except Exception as ce:
            logger.warning(f"Could not write document cache to disk: {ce}")

        return result

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached document by doc_id."""
        if not doc_id:
            return None

        # Check in-memory cache
        if doc_id in _DOCUMENT_CACHE:
            return _DOCUMENT_CACHE[doc_id]

        # Check disk cache
        cache_file = os.path.join(TEMP_UPLOAD_DIR, f"{doc_id}.json")
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    _DOCUMENT_CACHE[doc_id] = data
                    return data
            except Exception as e:
                logger.warning(f"Error reading disk cache for doc {doc_id}: {e}")

        return None


document_parser = DocumentParserService()
