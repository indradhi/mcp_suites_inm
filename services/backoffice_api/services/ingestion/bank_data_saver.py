import hashlib
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from services.vector_store import vector_store
from models.knowledge_source import KnowledgeSource, KnowledgeDocument

logger = logging.getLogger(__name__)

def save_tool_records_to_bank_data(
    source: KnowledgeSource,
    query_args: Dict[str, Any],
    records: List[Dict[str, Any]],
    db = None
) -> int:
    """
    Automatically ingests query-by-parameter results into ChromaDB vector store
    and registers them into KnowledgeDocument as cumulative 'Bank Data'.
    Idempotent: Prevents duplication via content-based hashing.
    """
    if not records or not isinstance(records, list):
        return 0

    texts_to_index = []
    metas_to_index = []
    ids_to_index = []

    for r_idx, record in enumerate(records[:100]):
        if not isinstance(record, dict):
            continue

        fields = [f"Sumber Data: {source.name} ({source.source_type.upper()})"]
        if query_args:
            args_str = ", ".join(f"{k}={v}" for k, v in query_args.items() if v)
            if args_str:
                fields.append(f"Parameter Query: {args_str}")

        clean_rec = {}
        for k, v in record.items():
            if v is not None and str(v).strip():
                val_str = str(v).strip()
                # Avoid polluting vector search text with giant base64 image strings
                if len(val_str) > 500 and (
                    val_str.startswith('/9j/') or 
                    val_str.startswith('data:image') or
                    val_str.startswith('iVBORw0KGgo') or
                    val_str.startswith('R0lGOD') or
                    val_str.startswith('UklGR')
                ):
                    clean_rec[k] = "[FOTO_ATTACHED]"
                    fields.append(f"{k}: [FOTO_ATTACHED]")
                else:
                    clean_rec[k] = val_str
                    fields.append(f"{k}: {val_str[:2500]}")

        chunk_text = "\n".join(fields)
        if not chunk_text.strip():
            continue

        # Generate unique deterministic ID using source_id and record hash
        rec_hash = hashlib.md5(json.dumps(clean_rec, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:12]
        chunk_id = f"bank_src_{source.id}_{rec_hash}"

        metadata = {
            "source_id": source.id,
            "source_name": source.name,
            "source_type": source.source_type,
            "is_bank_data": True,
            "queried_at": datetime.utcnow().isoformat()
        }

        texts_to_index.append(chunk_text)
        metas_to_index.append(metadata)
        ids_to_index.append(chunk_id)

    if texts_to_index:
        try:
            vector_store.add_chunks(texts_to_index, metas_to_index, ids_to_index)
            logger.info(f"Successfully cached {len(texts_to_index)} record(s) from '{source.name}' into ChromaDB Bank Data.")

            # Update document record and source timestamp if db session is provided
            if db:
                try:
                    coll = vector_store.get_collection()
                    existing = coll.get(where={"source_id": source.id})
                    actual_count = len(existing.get("ids", [])) if existing else len(texts_to_index)
                except Exception:
                    actual_count = len(texts_to_index)

                doc_title = f"Bank Data: {source.name} (Hasil Query On-Demand)"
                doc = db.query(KnowledgeDocument).filter(
                    KnowledgeDocument.source_id == source.id,
                    KnowledgeDocument.title == doc_title
                ).first()

                if not doc:
                    doc = KnowledgeDocument(
                        source_id=source.id,
                        title=doc_title,
                        file_type="bank_data",
                        chunk_count=actual_count,
                        status="processed"
                    )
                    db.add(doc)
                else:
                    doc.chunk_count = actual_count

                source.last_synced_at = datetime.utcnow()
                db.commit()

            return len(texts_to_index)
        except Exception as e:
            logger.error(f"Failed to cache tool records into Bank Data: {e}")

    return 0
