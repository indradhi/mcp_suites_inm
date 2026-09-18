import hashlib
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from services.vector_store import vector_store
from models.knowledge_source import KnowledgeSource, KnowledgeDocument

logger = logging.getLogger(__name__)

def normalize_tool_data(raw_data: Any) -> List[Dict[str, Any]]:
    """
    Normalizes any API or database response into a flat list of dict records.
    Handles:
    - List of dicts: [ {...}, {...} ]
    - Dict with 'combinedResults': BPN API style [{'pemilik': [...], 'result': [...]}]
    - Dict with 'data', 'results', 'items', 'rows', 'records'
    - Single dict: {...}
    """
    if not raw_data:
        return []
    if isinstance(raw_data, list):
        return [r for r in raw_data if isinstance(r, dict)]
    if not isinstance(raw_data, dict):
        return []

    # 1. BPN-style combinedResults (Land certificates with owner info)
    if 'combinedResults' in raw_data and isinstance(raw_data['combinedResults'], list):
        records = []
        for cr in raw_data['combinedResults']:
            owners = cr.get('pemilik', [])
            owner_info = owners[0] if (owners and isinstance(owners, list) and isinstance(owners[0], dict)) else {}
            results = cr.get('result', [])
            if results and isinstance(results, list):
                for res in results:
                    if isinstance(res, dict):
                        rec = {}
                        if owner_info:
                            for ok, ov in owner_info.items():
                                if ov is not None and str(ov).strip() and str(ov).strip() != '-':
                                    rec[f"pemilik_{ok}"] = ov
                        for rk, rv in res.items():
                            if rk == 'Polygon':
                                continue
                            if rk == 'catatan' and isinstance(rv, list):
                                cat_strs = []
                                for c in rv:
                                    if isinstance(c, dict):
                                        prosedur = c.get('prosedur') or ''
                                        tgl = c.get('tanggal') or ''
                                        pemegang = c.get('pemeganghak') or ''
                                        cat_strs.append(f"{prosedur} ({tgl}) - {pemegang}")
                                rec['riwayat_catatan'] = '; '.join(cat_strs)
                            else:
                                rec[rk] = rv
                        records.append(rec)
            elif owner_info:
                records.append(owner_info)
        if records:
            return records

    # 2. Common list-holding container keys
    for key in ['data', 'results', 'items', 'rows', 'records']:
        if key in raw_data and isinstance(raw_data[key], list):
            return [r for r in raw_data[key] if isinstance(r, dict)]

    # 3. Single record dictionary
    return [raw_data]


def save_tool_records_to_bank_data(
    source: KnowledgeSource,
    query_args: Dict[str, Any],
    records: Any,
    db = None
) -> int:
    """
    Automatically ingests query-by-parameter results into ChromaDB vector store
    and registers them into KnowledgeDocument as cumulative 'Bank Data'.
    Idempotent: Prevents duplication via content-based hashing.
    """
    norm_records = normalize_tool_data(records)
    if not norm_records:
        return 0

    texts_to_index = []
    metas_to_index = []
    ids_to_index = []

    for r_idx, record in enumerate(norm_records[:100]):
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
