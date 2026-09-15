import os
import logging
from typing import List, Dict, Any
import pandas as pd

logger = logging.getLogger(__name__)

class ExcelIngester:
    def extract_text(self, file_path: str) -> List[Dict[str, Any]]:
        results = []
        try:
            excel_file = pd.ExcelFile(file_path)
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
                df = df.dropna(how="all")
                if df.empty:
                    continue

                # Convert rows to semantic record representations
                records_text = []
                columns = list(df.columns)
                records_text.append(f"Sheet: {sheet_name} | Columns: {', '.join(str(c) for c in columns)}")

                for idx, row in df.iterrows():
                    row_parts = []
                    for col in columns:
                        val = row[col]
                        if pd.notna(val):
                            row_parts.append(f"{col}: {val}")
                    if row_parts:
                        records_text.append(f"Row {idx+1}: " + " | ".join(row_parts))

                full_sheet_text = "\n".join(records_text)

                # Split sheet text into chunks of roughly 50 rows each
                chunk_size = 50
                for chunk_idx, i in enumerate(range(1, len(records_text), chunk_size)):
                    chunk_slice = [records_text[0]] + records_text[i:i+chunk_size]
                    chunk_content = "\n".join(chunk_slice)
                    results.append({
                        "sheet": sheet_name,
                        "chunk_index": chunk_idx + 1,
                        "text": chunk_content,
                        "metadata": {
                            "source_file": os.path.basename(file_path),
                            "sheet": sheet_name,
                            "rows": len(records_text) - 1
                        }
                    })

        except Exception as e:
            logger.error(f"Error parsing Excel file {file_path}: {e}")
            raise

        return results

excel_ingester = ExcelIngester()
